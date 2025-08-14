import crypto from "node:crypto"
import path from "node:path"
import fs from "node:fs"
import http from "node:http"

import * as Utils from "./utils.js"
import type * as Entities from "./entities.js"
import type * as ApiServer from "./ports/apiServer.js"
import type * as Crawler from "./ports/crawler.js"
import type * as PageDataExtractor from "./ports/pageDataExtractor.js"
import type * as ArnsResolver from "./ports/arnsResolver.js"
import type * as PageDataStorage from "./ports/pageDataStorage.js"
import type * as WebServer from "./ports/webServer.js"
import type * as PageDeduplicator from "./ports/pageDeduplicator.js"

export interface CrawlingServiceConfig {
  adapters: {
    inputs: {
      apiServer: ApiServer.ApiServerInput
      crawlers: Record<Entities.CrawlerTypes, Crawler.CrawlerInput>
      arnsResolver: ArnsResolver.ArnsResolverInput
    }
    utils: {
      pageDataExtractor: PageDataExtractor.PageDataExtractorUtil
      pageDeduplicator: PageDeduplicator.PageDeduplicatorUtil
    }
    outputs: {
      pageDataStorage: PageDataStorage.PageDataStorageOutput
      webServer: WebServer.WebServerOutput
    }
  }
}

export default class CrawlingService {
  #tasks: Record<string, Entities.CrawlTask> = {}
  #inputs: CrawlingServiceConfig["adapters"]["inputs"]
  #utils: CrawlingServiceConfig["adapters"]["utils"]
  #outputs: CrawlingServiceConfig["adapters"]["outputs"]

  #pageDataStores: Record<string, PageDataStorage.PageDataStore> = {}
  #pageDeduplicateStores: Record<string, PageDeduplicator.PageDuplicateStore> = {}

  #apiServerHandler?: ApiServer.ApiServerHandler

  static async start(config: CrawlingServiceConfig) {
    return new CrawlingService(config).start()
  }

  constructor(config: CrawlingServiceConfig) {
    this.#inputs = config.adapters.inputs
    this.#utils = config.adapters.utils
    this.#outputs = config.adapters.outputs
  }

  async start() {
    const apiServerStart = await this.#inputs.apiServer.start({
      handlers: {
        createTask: this.#createTaskHandler.bind(this),
      },
    })

    if (apiServerStart.failed)
      return console.error("[CrawlingService.#inputs.apiServer]", apiServerStart.error.message)

    this.#apiServerHandler = apiServerStart.data

    const webServerStart = await this.#outputs.webServer.start({
      port: 3000,
      requestHandler: this.#webServerHandler.bind(this),
    })

    if (webServerStart.failed)
      return console.error("[CrawlingService.#outputs.webServer]", webServerStart.error.message)

    console.info("[CrawlingService.#outputs.apiServer] Running at http://localhost:3000/")
    console.info("[CrawlingService.#outputs.webServer] Running at http://localhost:3000/exports")
  }

  // called by WebServerPort
  async #webServerHandler(
    request: http.IncomingMessage,
    response: http.ServerResponse<http.IncomingMessage>,
  ) {
    const url = request.url || "/"

    if (!url.startsWith("/exports/")) return this.#apiServerHandler?.(request, response)

    response.setHeader("Content-Type", "application/octet-stream")
    const filePath = path.join(path.resolve("storage"), url)
    console.info("[CrawlingService.#outputs.webServer]", filePath)
    fs.createReadStream(filePath).pipe(response)
  }

  // called by ApiServerPort for every new crawl request
  async #createTaskHandler(taskConfig: Entities.CrawlTaskConfig) {
    const task: Entities.CrawlTask = {
      ...taskConfig,
      id: crypto.randomUUID(),
      pageCount: 0,
      duplicateCount: 0,
      createdAt: Date.now(),
    }

    const crawler = this.#inputs.crawlers["browser"]

    setTimeout(async () => {
      const openingPageDataStore = await this.#outputs.pageDataStorage.open(task.id)

      if (openingPageDataStore.failed)
        return console.error(
          "[CrawlingService.#output.resultStorage]",
          openingPageDataStore.error.message,
        )

      const pageDataStore = openingPageDataStore.data
      this.#pageDataStores[task.id] = pageDataStore

      const openingPageDuplicateStore = await this.#utils.pageDeduplicator.open(
        task.id,
        task.similarityThreshold,
      )
      if (openingPageDuplicateStore.failed)
        return console.error(
          "[CrawlingService.#utils.pageDeduplicator]",
          openingPageDuplicateStore.error.message,
        )

      this.#pageDeduplicateStores[task.id] = openingPageDuplicateStore.data

      let initialRequests: Crawler.CrawlerRequest[] = []
      for (const arnsName of taskConfig.arnsNames) {
        const gatewayUrl = await this.#inputs.arnsResolver.resolve(arnsName)

        if (gatewayUrl.failed)
          return console.error("[CrawlingService.#input.arnsResolver]", gatewayUrl.error.message)

        const wayfinderUrl = await this.#inputs.arnsResolver.dissolve(gatewayUrl.data)

        if (wayfinderUrl.failed)
          return console.error("[CrawlingService.#input.arnsResolver]", wayfinderUrl.error.message)

        initialRequests.push({ gatewayUrl: gatewayUrl.data, wayfinderUrl: wayfinderUrl.data })
      }

      const crawling = await crawler.start({
        taskId: task.id,
        initialRequests,
        extractHashUrls: taskConfig.extractHashUrls,
        maxDepth: taskConfig.maxDepth,
        maxPages: taskConfig.maxPages,
        pageDataHandler: this.#pageDataHandler.bind(this),
        scrapingErrorHandler: this.#scrapingErrorHandler.bind(this),
        resolveUrlHandler: this.#resolveUrlHandler.bind(this),
      })
      delete this.#pageDataStores[task.id]
      delete this.#pageDeduplicateStores[task.id]

      if (crawling.failed)
        return console.error("[CrawlingService.#input.crawler]", crawling.error.message)

      const exportingPageData = await pageDataStore.export()

      if (exportingPageData.failed)
        return console.error("[CrawlingService.#stores]", exportingPageData.error.message)

      await pageDataStore.close()

      task.finishedAt = Date.now()

      console.info("[CrawlingService.#inputs.crawler] Task finished:", task)
    }, 100)

    console.info("[CrawlingService.#inputs.apiServer] Task created:", task)
    this.#tasks[task.id] = task
    return task
  }

  // called by CrawlerPort for every crawled page
  async #pageDataHandler(pageData: Crawler.CrawlerPageData) {
    const task = this.#tasks[pageData.taskId]
    if (!task) return Utils.error(new Error("Task not found for " + pageData.taskId))

    const extractingHtmlData = await this.#utils.pageDataExtractor.extract(pageData.html)

    if (extractingHtmlData.failed) return Utils.error(extractingHtmlData.error)

    const htmlWithoutTags = extractingHtmlData.data.normalizedHtml.replace(/<[^>]*>/g, "")

    const pageDuplicateStore = this.#pageDeduplicateStores[pageData.taskId]
    if (!pageDuplicateStore) return Utils.error(new Error("Page deduplicate store not found"))
    const checkingDuplicate = await pageDuplicateStore.check(htmlWithoutTags)
    if (checkingDuplicate.failed) return Utils.error(checkingDuplicate.error)
    if (checkingDuplicate.data) {
      task.duplicateCount++
      return Utils.empty()
    }

    const arweaveTxId = pageData.headers.find((header) => header.name === "x-ar-io-data-id")?.value
    if (!arweaveTxId)
      return Utils.error(new Error(`Missing x-ar-io-data-id header for ${pageData.gatewayUrl}`))

    // sort found URLs, but don't use local compare, the sorting needs to be stable across different environments
    pageData.foundUrls.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    )

    const store = this.#pageDataStores[pageData.taskId]
    if (!store) return Utils.error(new Error("Store not found for " + pageData.taskId))
    const storingPageData = await store.save({
      ...extractingHtmlData.data,
      txId: arweaveTxId,
      arnsName: pageData.arnsName,
      wayfinderUrl: pageData.wayfinderUrl,
      gatewayUrl: pageData.gatewayUrl,
      headers: pageData.headers,
      relativeUrls: pageData.foundUrls.filter(
        (url) => url.startsWith("/") || url.startsWith("./") || url.startsWith("#/"),
      ),
      absoluteUrls: pageData.foundUrls.filter(
        (url) => !url.startsWith("/") && !url.startsWith("./") && !url.startsWith("#/"),
      ),
    })

    // causes the crawler to retry the URL
    if (storingPageData.failed) return Utils.error(storingPageData.error)

    console.debug("[CrawlingService.#inputs.crawler] Page data stored:", pageData.wayfinderUrl)
    task.pageCount++
    return Utils.empty()
  }

  // called by CrawlerPort for every new URL
  // Updates URLs to a new gateway
  async #resolveUrlHandler(oldGatewayUrl: Entities.GatewayUrl) {
    const resolvingWayfinderUrl = await this.#inputs.arnsResolver.dissolve(oldGatewayUrl)
    if (resolvingWayfinderUrl.failed) return Utils.error(resolvingWayfinderUrl.error)

    const resolvingGatewayUrl = await this.#inputs.arnsResolver.resolve(resolvingWayfinderUrl.data)
    if (resolvingGatewayUrl.failed) return Utils.error(resolvingGatewayUrl.error)

    return Utils.ok({
      gatewayUrl: resolvingGatewayUrl.data,
      wayfinderUrl: resolvingWayfinderUrl.data,
    })
  }

  // called by CrawlerPort in the case of scraping issues
  async #scrapingErrorHandler(input: Crawler.CrawlerErrorHandlerData) {
    const resolvingWayfinderUrl = await this.#inputs.arnsResolver.dissolve(input.failedUrl)

    if (resolvingWayfinderUrl.failed) return Utils.error(resolvingWayfinderUrl.error)

    let resolvingGatewayUrl: Utils.Result<Entities.GatewayUrl>
    do {
      // choose new gateway for failed URL
      resolvingGatewayUrl = await this.#inputs.arnsResolver.resolve(resolvingWayfinderUrl.data)

      if (resolvingGatewayUrl.failed) return Utils.error(resolvingGatewayUrl.error)
    } while (resolvingGatewayUrl.data === input.failedUrl)

    console.warn(`[CrawlingService.#input.crawler] Failed: ${input.failedUrl}`)
    console.warn(`[CrawlingService.#input.crawler] Retrying: ${resolvingGatewayUrl.data}`)

    return resolvingGatewayUrl
  }
}
