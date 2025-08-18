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
      return console.error({
        time: new Date(),
        level: "error",
        source: "ApiServer",
        message: apiServerStart.error.message,
      })

    this.#apiServerHandler = apiServerStart.data

    const webServerStart = await this.#outputs.webServer.start({
      port: 3000,
      requestHandler: this.#webServerHandler.bind(this),
    })

    if (webServerStart.failed)
      return console.error({
        time: new Date(),
        level: "error",
        source: "WebServer",
        message: webServerStart.error.message,
      })

    console.info({
      time: new Date(),
      level: "info",
      source: "CrawlingService",
      message: "service started",
      context: {
        apiServerUrl: "http://localhost:3000",
        webServerUrl: "http://localhost:3000/exports",
      },
    })
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

    const crawler = taskConfig.executeJavaScript
      ? this.#inputs.crawlers["browser"]
      : this.#inputs.crawlers["html"]

    setTimeout(async () => {
      const openingPageDataStore = await this.#outputs.pageDataStorage.open(task.id)

      if (openingPageDataStore.failed)
        return console.error({
          time: new Date(),
          level: "error",
          source: "PageDataStorage",
          message: openingPageDataStore.error.message,
          context: {
            taskId: task.id,
          },
        })

      const pageDataStore = openingPageDataStore.data
      this.#pageDataStores[task.id] = pageDataStore

      const openingPageDuplicateStore = await this.#utils.pageDeduplicator.open(
        task.id,
        task.similarityThreshold,
      )
      if (openingPageDuplicateStore.failed)
        return console.error({
          time: new Date(),
          level: "error",
          source: "PageDeduplicator",
          message: openingPageDuplicateStore.error.message,
          context: {
            taskId: task.id,
            similarityThreshold: task.similarityThreshold,
          },
        })

      this.#pageDeduplicateStores[task.id] = openingPageDuplicateStore.data

      let initialRequests: Crawler.CrawlerRequest[] = []
      for (const arnsName of taskConfig.arnsNames) {
        const resolvingGatewayUrl = await this.#inputs.arnsResolver.resolve(arnsName)

        if (resolvingGatewayUrl.failed)
          return console.error({
            time: new Date(),
            level: "error",
            source: "ArnsResolver",
            message: resolvingGatewayUrl.error.message,
            context: {
              taskId: task.id,
              arnsName,
            },
          })

        const dissolvingWayfinderUrl = await this.#inputs.arnsResolver.dissolve(
          resolvingGatewayUrl.data,
        )

        if (dissolvingWayfinderUrl.failed)
          return console.error({
            time: new Date(),
            level: "error",
            source: "ArnsResolver",
            message: dissolvingWayfinderUrl.error.message,
            context: {
              taskId: task.id,
              gatewayUrl: resolvingGatewayUrl.data,
            },
          })

        initialRequests.push({
          gatewayUrl: resolvingGatewayUrl.data,
          wayfinderUrl: dissolvingWayfinderUrl.data,
        })
      }

      const crawling = await crawler.start({
        taskId: task.id,
        initialRequests,
        extractHashUrls: taskConfig.extractHashUrls,
        maxDepth: taskConfig.maxDepth,
        maxPages: taskConfig.maxPages,
        pageInitHandler: this.#pageInitHandler,
        pageDataHandler: this.#pageDataHandler.bind(this),
        scrapingErrorHandler: this.#scrapingErrorHandler.bind(this),
        resolveUrlHandler: this.#resolveUrlHandler.bind(this),
      })
      delete this.#pageDataStores[task.id]
      delete this.#pageDeduplicateStores[task.id]

      console.info({
        time: new Date(),
        level: "info",
        source: "Crawler",
        message: "crawling completed",
        context: {
          taskId: task.id,
          pageCount: task.pageCount,
          duplicateCount: task.duplicateCount,
        },
      })
      if (crawling.failed)
        return console.error({
          time: new Date(),
          level: "error",
          source: "Crawler",
          message: crawling.error.message,
          context: {
            taskId: task.id,
          },
        })

      const exportingPageData = await pageDataStore.export()

      if (exportingPageData.failed)
        return console.error({
          time: new Date(),
          level: "error",
          source: "PageDataStorage",
          message: exportingPageData.error.message,
          context: {
            taskId: task.id,
          },
        })

      console.info({
        time: new Date(),
        level: "info",
        source: "PageDataStorage",
        message: "export completed",
        context: {
          taskId: task.id,
        },
      })

      await pageDataStore.close()

      console.info({
        time: new Date(),
        level: "info",
        source: "PageDataStorage",
        message: "storage closed",
        context: {
          taskId: task.id,
        },
      })

      task.finishedAt = Date.now()

      console.info({
        time: new Date(),
        level: "info",
        source: "CrawlingService",
        message: `task completed`,
        context: task,
      })
    }, 100)

    console.info({
      time: new Date(),
      level: "info",
      source: "ApiServer",
      message: "task created",
      context: task,
    })
    this.#tasks[task.id] = task

    return task
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
      console.info({
        time: new Date(),
        level: "info",
        source: "PageDeduplicator",
        message: "duplicate found",
        context: {
          taskId: task.id,
          wayfinderUrl: pageData.wayfinderUrl,
          duplicateCount: task.duplicateCount,
          similarity: checkingDuplicate.data.similarity,
        },
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

    console.info({
      time: new Date(),
      level: "info",
      source: "PageDataStorage",
      message: "page stored",
      context: {
        taskId: task.id,
        wayfinderUrl: pageData.wayfinderUrl,
        pageNumber: task.pageCount,
      },
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

    console.warn({
      time: new Date(),
      level: "warning",
      source: "Crawler",
      message: input.errorMessages.pop()?.split("\n"),
      context: {
        taskId: input.taskId,
        retry: input.retryCount + 1,
        wayfinderUrl: resolvingWayfinderUrl.data,
        failedGatewayUrl: input.failedUrl,
        newGatewayUrl: resolvingGatewayUrl.data,
      },
    })

    return resolvingGatewayUrl
  }
}
