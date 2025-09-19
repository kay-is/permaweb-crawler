import crypto from "node:crypto"
import fs from "node:fs"

import * as Utils from "./utils.js"
import type * as Entities from "./entities.js"
import type * as Config from "./ports/config.js"
import type * as Crawler from "./ports/crawler.js"
import type * as PageDataExtractor from "./ports/pageDataExtractor.js"
import type * as ArnsResolver from "./ports/arnsResolver.js"
import type * as PageDataStorage from "./ports/pageDataStorage.js"
import type * as WebServer from "./ports/webServer.js"
import type * as PageDataUploader from "./ports/pageDataUploader.js"
import type * as PageDeduplicator from "./ports/pageDeduplicator.js"

export interface CrawlingServiceAdapters {
  inputs: {
    arnsResolver: ArnsResolver.ArnsResolverInput
    config: Config.ConfigInput
    crawlers: Record<Entities.CrawlerTypes, Crawler.CrawlerInput>
    webServer: WebServer.WebServerInput
  }
  utils: {
    pageDataExtractor: PageDataExtractor.PageDataExtractorUtil
    pageDeduplicator: PageDeduplicator.PageDeduplicatorUtil
  }
  outputs: {
    pageDataStorage: PageDataStorage.PageDataStorageOutput
    pageDataUploader: PageDataUploader.PageDataUploaderOutput
  }
}

export default class CrawlingService {
  #log: ReturnType<typeof Utils.getLogger>

  #inputs: CrawlingServiceAdapters["inputs"]
  #utils: CrawlingServiceAdapters["utils"]
  #outputs: CrawlingServiceAdapters["outputs"]

  #tasks: Record<string, Entities.CrawlTask> = {}
  #runningTask?: Entities.CrawlTask

  #pageDataStores: Record<string, PageDataStorage.PageDataStore> = {}
  #pageDeduplicateStores: Record<string, PageDeduplicator.PageDuplicateStore> = {}

  static async start(adapters: CrawlingServiceAdapters) {
    return new CrawlingService(adapters).start()
  }

  constructor(adapters: CrawlingServiceAdapters) {
    this.#inputs = adapters.inputs
    this.#utils = adapters.utils
    this.#outputs = adapters.outputs

    Utils.setLogLevel(this.#inputs.config.logLevel)
    this.#log = Utils.getLogger("CrawlingService")
  }

  async start() {
    const webServerStart = await this.#inputs.webServer.start({
      port: this.#inputs.config.port,
      handlers: {
        createTask: this.#createTaskHandler.bind(this),
        listTasks: this.#listTasksHandler.bind(this),
      },
    })

    if (webServerStart.failed) return this.#log.error(webServerStart.error.message)

    try {
      const tasksJson = fs.readFileSync("storage/tasks.json", "utf-8")
      this.#tasks = JSON.parse(tasksJson) as Record<string, Entities.CrawlTask>
    } catch (e) {}

    await this.#outputs.pageDataUploader.start(this.#inputs.config)

    this.#log.info({
      msg: "service started",
      taskCount: Object.keys(this.#tasks).length,
      apiUrl: "http://localhost:3000/",
      webApptUrl: "http://localhost:3000/app/",
      config: this.#inputs.config,
    })
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
    // clean up finished tasks if there are too many
    if (Object.keys(this.#tasks).length > this.#inputs.config.maxTasks) {
      Object.keys(this.#tasks).forEach((taskId) => {
        const task = this.#tasks[taskId]
        if (task && task.finishedAt) delete this.#tasks[taskId]
      })
    }

    return task
  }

  async #runTaskHandler(task: Entities.CrawlTask) {
    this.#log.info({ msg: "starting task", taskId: task.id })
    task.startedAt = Date.now()

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

    this.#log.debug({ msg: "export completed", taskId: task.id })

    const uploadingData = await this.#outputs.pageDataUploader.upload(task.id)

    if (uploadingData.failed) {
      task.error = uploadingData.error.message
      return this.#log.error({ msg: uploadingData.error.message, taskId: task.id })
    }

    await pageDataStore.close()

    delete this.#pageDataStores[task.id]
    delete this.#pageDeduplicateStores[task.id]

    task.uploadId = uploadingData.data

    task.finishedAt = Date.now()

    this.#log.info({
      msg: "task completed",
      taskId: task.id,
      pageCount: task.pageCount,
      duplicateCount: task.duplicateCount,
      uploadId: task.uploadId,
    })

    fs.writeFile("storage/tasks.json", JSON.stringify(this.#tasks, null, 2), (error) => {
      if (error) this.#log.error({ msg: error.message, error })
      this.#log.info({ msg: "tasks saved to storage/tasks.json" })
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

  // called by CrawlerPort for every crawled page if javascript execution is enabled
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
      this.#log.debug({
        msg: "duplicate found",
        taskId: task.id,
        wayfinderUrl: pageData.wayfinderUrl,
        duplicateCount: task.duplicateCount,
        similarity: checkingDuplicate.data.similarity,
      })
      return Utils.empty()
    }

    const store = this.#pageDataStores[pageData.taskId]
    if (!store) return Utils.error(new Error("Store not found for " + pageData.taskId))

    const relativeUrls = pageData.foundUrls.filter(
      (url) => url.startsWith("/") || url.startsWith("./") || url.startsWith("#/"),
    )

    const absoluteUrls = pageData.foundUrls.filter(
      (url) => !url.startsWith("/") && !url.startsWith("./") && !url.startsWith("#/"),
    )

    const storingPageData = await store.save({
      ...extractingHtmlData.data,
      arnsName: pageData.arnsName,
      txId: pageData.resolvedId,
      dataId: pageData.dataId,
      wayfinderUrl: pageData.wayfinderUrl,
      absoluteUrls,
      relativeUrls,
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

    // failed requests will be retried with the ar.io gateway.
    const newUrl = new URL(resolvingWayfinderUrl.data.replace("ar://", "https://"))
    newUrl.hostname = `${newUrl.hostname}.${this.#inputs.config.fallbackGateway}`

    const newGatewayUrl = decodeURIComponent(newUrl.toString())

    this.#log.warn({
      msg: input.errorMessages,
      taskId: input.taskId,
      retryCount: input.retryCount + 1,
      wayfinderUrl: resolvingWayfinderUrl.data,
      failedGatewayUrl: input.failedUrl,
      newGatewayUrl,
    })

    return Utils.ok(newGatewayUrl)
  }
}
