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
  #log = Utils.getLogger("CrawlingService")

  #tasks: Record<string, Entities.CrawlTask> = {}
  #runningTask?: Entities.CrawlTask
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
        listTasks: this.#listTasksHandler.bind(this),
      },
    })

    if (apiServerStart.failed) return this.#log.error(apiServerStart.error.message)

    this.#apiServerHandler = apiServerStart.data

    const webServerStart = await this.#outputs.webServer.start({
      port: 3000,
      requestHandler: this.#webServerHandler.bind(this),
    })

    if (webServerStart.failed) return this.#log.error(webServerStart.error.message)

    this.#log.info({
      msg: "started",
      apiServerUrl: "http://localhost:3000/",
      webAppUrl: "http://localhost:3000/app/",
      exportDataUrl: "http://localhost:3000/exports/",
    })
  }

  // called by WebServerPort
  async #webServerHandler(
    request: http.IncomingMessage,
    response: http.ServerResponse<http.IncomingMessage>,
  ) {
    let url = request.url || "/"

    if (url.startsWith("/app/")) {
      if (url.endsWith("/")) {
        response.setHeader("Location", url + "index.html")
        response.statusCode = 301
        return response.end()
      }

      response.setHeader("Content-Type", "text/html")
      url = url.split("?")[0] as string
      const filePath = path.join(path.resolve("public"), url)
      try {
        return fs.createReadStream(filePath).pipe(response)
      } catch (error: any) {
        this.#log.error(error.message)
        response.statusCode = 404
        return response.end("File not found")
      }
    }

    if (url.startsWith("/exports/")) {
      if (url.endsWith("/")) {
        return fs.readdir(path.resolve("storage/exports"), (_, files) => {
          response.setHeader("Content-Type", "application/json")
          try {
            return response.end(
              JSON.stringify({
                files: files.map((file) => ({
                  url: `/exports/${file}`,
                  time: fs.statSync(path.join("storage/exports", file)).mtime,
                  size: fs.statSync(path.join("storage/exports", file)).size,
                })),
              }),
            )
          } catch (error: any) {
            return response.end(JSON.stringify({ files: [] }))
          }
        })
      }

      response.setHeader("Content-Type", "application/octet-stream")
      const filePath = path.join(path.resolve("storage"), url)
      try {
        return fs.createReadStream(filePath).pipe(response)
      } catch (error: any) {
        this.#log.error(error.message)
        response.statusCode = 404
        return response.end("File not found")
      }
    }

    return this.#apiServerHandler?.(request, response)
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

    this.#tasks[task.id] = task

    this.#log.info({ msg: "task created", taskId: task.id })

    if (!this.#runningTask) {
      this.#runningTask = task
      setTimeout(async () => this.#runTaskHandler(task), 10)
    } else {
      this.#log.info({
        msg: "task queued",
        taskId: task.id,
        runningTaskId: this.#runningTask.id,
        taskCount: Object.keys(this.#tasks).length,
      })
    }

    return task
  }

  async #runTaskHandler(task: Entities.CrawlTask) {
    this.#log.info({ msg: "starting task", taskId: task.id })

    const openingPageDataStore = await this.#outputs.pageDataStorage.open(task.id)

    if (openingPageDataStore.failed)
      return this.#log.error({ msg: openingPageDataStore.error.message, taskId: task.id })

    const pageDataStore = openingPageDataStore.data
    this.#pageDataStores[task.id] = pageDataStore

    const openingPageDuplicateStore = await this.#utils.pageDeduplicator.open(
      task.id,
      task.similarityThreshold,
    )
    if (openingPageDuplicateStore.failed)
      return this.#log.error({
        msg: openingPageDuplicateStore.error.message,
        taskId: task.id,
        similarityThreshold: task.similarityThreshold,
      })

    this.#pageDeduplicateStores[task.id] = openingPageDuplicateStore.data

    let initialRequests: Crawler.CrawlerRequest[] = []
    for (const arnsName of task.arnsNames) {
      const resolvingGatewayUrl = await this.#inputs.arnsResolver.resolve(arnsName)

      if (resolvingGatewayUrl.failed)
        return this.#log.error({
          msg: resolvingGatewayUrl.error.message,
          taskId: task.id,
          arnsName,
        })

      const dissolvingWayfinderUrl = await this.#inputs.arnsResolver.dissolve(
        resolvingGatewayUrl.data,
      )

      if (dissolvingWayfinderUrl.failed)
        return this.#log.error({
          msg: dissolvingWayfinderUrl.error.message,
          taskId: task.id,
          gatewayUrl: resolvingGatewayUrl.data,
        })

      initialRequests.push({
        gatewayUrl: resolvingGatewayUrl.data,
        wayfinderUrl: dissolvingWayfinderUrl.data,
      })
    }

    const crawler = task.executeJavaScript
      ? this.#inputs.crawlers["browser"]
      : this.#inputs.crawlers["html"]

    const crawling = await crawler.start({
      taskId: task.id,
      initialRequests,
      extractHashUrls: task.extractHashUrls,
      maxDepth: task.maxDepth,
      maxPages: task.maxPages,
      pageInitHandler: this.#pageInitHandler,
      pageDataHandler: this.#pageDataHandler.bind(this),
      scrapingErrorHandler: this.#scrapingErrorHandler.bind(this),
      resolveUrlHandler: this.#resolveUrlHandler.bind(this),
    })

    if (crawling.failed) {
      task.error = crawling.error.message
      return this.#log.error({ msg: crawling.error.message, taskId: task.id })
    }

    const exportingPageData = await pageDataStore.export()

    if (exportingPageData.failed) {
      task.error = exportingPageData.error.message
      return this.#log.error({ msg: exportingPageData.error.message, taskId: task.id })
    }

    await pageDataStore.close()

    this.#log.debug({ msg: "export completed", taskId: task.id })

    task.finishedAt = Date.now()

    this.#log.info({
      msg: "task completed",
      ctaskId: task.id,
      pageCount: task.pageCount,
      duplicateCount: task.duplicateCount,
    })

    const nextTask = Object.values(this.#tasks).find((t) => t.id !== task.id && !t.finishedAt)
    if (nextTask) {
      this.#runningTask = nextTask
      setTimeout(async () => await this.#runTaskHandler(nextTask), 10)
    } else {
      this.#runningTask = undefined
      this.#log.info("no more tasks, service idle")
    }
  }

  async #listTasksHandler() {
    return Object.values(this.#tasks)
  }

  // called by CrawlerPort for every crawled page
  // excutes befor the javascript of the page
  // used to set up a stable environment for the crawler
  // "this" is not available in this function because it's called in the browser context
  #pageInitHandler = () => {
    let randomSeed = 0
    Math.random = () => {
      const x = Math.sin(randomSeed++) * 10000
      return x - Math.floor(x)
    }

    let nowSeed = 0
    Date.now = () => nowSeed++

    let performanceSeed = 0
    performance.now = () => performanceSeed++
  }

  // called by CrawlerPort for every crawled page
  async #pageDataHandler(pageData: Crawler.CrawlerPageData) {
    const task = this.#tasks[pageData.taskId]
    if (!task) return Utils.error(new Error("Task not found for " + pageData.taskId))

    const extractingHtmlData = await this.#utils.pageDataExtractor.extract(pageData.html)

    if (extractingHtmlData.failed) return Utils.error(extractingHtmlData.error)

    const pageDuplicateStore = this.#pageDeduplicateStores[pageData.taskId]
    if (!pageDuplicateStore) return Utils.error(new Error("Page deduplicate store not found"))

    const htmlWithoutTags = extractingHtmlData.data.normalizedHtml.replace(/<[^>]*>/g, "")
    const checkingDuplicate = await pageDuplicateStore.check(htmlWithoutTags)
    if (checkingDuplicate.failed) return Utils.error(checkingDuplicate.error)
    if (checkingDuplicate.data.isDuplicate) {
      task.duplicateCount++
      this.#log.warn({
        msg: "duplicate found",
        taskId: task.id,
        wayfinderUrl: pageData.wayfinderUrl,
        duplicateCount: task.duplicateCount,
        similarity: checkingDuplicate.data.similarity,
      })
      return Utils.empty()
    }

    const arweaveTxId = pageData.headers.find(
      (header) => header.name === "x-arns-resolved-id",
    )?.value
    if (!arweaveTxId) return Utils.error(new Error(`x-arns-resolved-id header missing`))

    // sort found URLs, but don't use local compare, the sorting needs to be stable across different environments
    pageData.foundUrls.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    )

    pageData.headers.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    )

    const store = this.#pageDataStores[pageData.taskId]
    if (!store) return Utils.error(new Error("Store not found for " + pageData.taskId))
    const storingPageData = await store.save({
      ...extractingHtmlData.data,
      txId: arweaveTxId,
      arnsName: pageData.arnsName.trim().toLowerCase(),
      wayfinderUrl: pageData.wayfinderUrl.trim().toLowerCase(),
      gatewayUrl: pageData.gatewayUrl.trim().toLowerCase(),
      headers: pageData.headers.map((header) => ({
        name: header.name.trim().toLowerCase(),
        value: header && header.value && header.value.trim ? header.value.trim().toLowerCase() : "",
      })),
      relativeUrls: pageData.foundUrls
        .filter((url) => url.startsWith("/") || url.startsWith("./") || url.startsWith("#/"))
        .map((url) => url.trim().toLowerCase()),
      absoluteUrls: pageData.foundUrls
        .filter((url) => !url.startsWith("/") && !url.startsWith("./") && !url.startsWith("#/"))
        .map((url) => url.trim().toLowerCase()),
    })

    // causes the crawler to retry the URL
    if (storingPageData.failed) return Utils.error(storingPageData.error)

    task.pageCount++

    this.#log.debug({
      msg: "page stored",
      taskId: task.id,
      wayfinderUrl: pageData.wayfinderUrl,
      pageCount: task.pageCount,
    })

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

    this.#log.warn({
      msg: input.errorMessages,
      taskId: input.taskId,
      retryCount: input.retryCount + 1,
      wayfinderUrl: resolvingWayfinderUrl.data,
      failedGatewayUrl: input.failedUrl,
      newGatewayUrl: resolvingGatewayUrl.data,
    })

    return resolvingGatewayUrl
  }
}
