import path from "node:path"
import fs from "node:fs"
import http from "node:http"

import type * as Entities from "./entities.js"
import type * as ApiServerPort from "./ports/apiServer.js"
import type * as CrawlerPort from "./ports/crawler.js"
import type * as PageDataExtractorPort from "./ports/pageDataExtractor.js"
import type * as ArnsResolverPort from "./ports/arnsResolver.js"
import type * as ResultStoragePort from "./ports/resultStorage.js"
import type * as WebServerPort from "./ports/webServer.js"

export interface CrawlingServiceConfig {
  adapters: {
    inputs: {
      apiServer: ApiServerPort.ApiServerInput
      crawlers: Record<Entities.CrawlerTypes, CrawlerPort.CrawlerInput>
      arnsResolver: ArnsResolverPort.ArnsResolverInput
    }
    utils: {
      pageDataExtractor: PageDataExtractorPort.PageDataExtractorUtil
    }
    outputs: {
      resultStorage: ResultStoragePort.ResultStorageOutput
      webServer: WebServerPort.WebServerOutput
    }
  }
}

export class CrawlingService {
  #tasks: Record<string, Entities.CrawlTask> = {}
  #inputs: CrawlingServiceConfig["adapters"]["inputs"]
  #utils: CrawlingServiceConfig["adapters"]["utils"]
  #outputs: CrawlingServiceConfig["adapters"]["outputs"]

  #apiServerHandler?: ApiServerPort.ApiServerHandler
  #stores: Record<string, ResultStoragePort.ResultStore> = {}

  static async start(config: CrawlingServiceConfig) {
    return new CrawlingService(config).start()
  }

  constructor(config: CrawlingServiceConfig) {
    this.#inputs = config.adapters.inputs
    this.#utils = config.adapters.utils
    this.#outputs = config.adapters.outputs
  }

  async start() {
    this.#apiServerHandler = await this.#inputs.apiServer.start({
      handlers: {
        createTask: this.#createTaskHandler.bind(this),
      },
    })

    await this.#outputs.webServer.start({
      port: 3000,
      requestHandler: this.#webServerHandler.bind(this),
    })
  }

  // called by WebServerPort
  // Serves Parquet files
  async #webServerHandler(
    request: http.IncomingMessage,
    response: http.ServerResponse<http.IncomingMessage>,
  ): Promise<void> {
    const url = request.url || "/"

    if (!url.startsWith("/exports/")) return this.#apiServerHandler?.(request, response)

    response.setHeader("Content-Type", "application/octet-stream")
    const filePath = path.join(path.resolve("storage"), url)
    console.info("[CrawlingService] Serving:", filePath)
    fs.createReadStream(filePath).pipe(response)
  }

  // called by ApiServerPort
  async #createTaskHandler(taskConfig: Entities.CrawlTaskConfig): Promise<Entities.CrawlTask> {
    const task: Entities.CrawlTask = {
      ...taskConfig,
      id: crypto.randomUUID(),
      pageCount: 0,
      createdAt: Date.now(),
    }

    const crawler = this.#inputs.crawlers["browser"]

    setTimeout(async () => {
      const store = await this.#outputs.resultStorage.open(task.id)
      this.#stores[task.id] = store

      let initialRequests: CrawlerPort.CrawlerRequest[] = []
      for (const arnsName of taskConfig.arnsNames) {
        try {
          const gatewayUrl = await this.#inputs.arnsResolver.resolve(arnsName)
          const wayfinderUrl = await this.#inputs.arnsResolver.dissolve(gatewayUrl)
          initialRequests.push({ gatewayUrl, wayfinderUrl })
        } catch (error: any) {
          task.error = error instanceof Error ? error.message : String(error)
          return console.error("[CrawlingService] Error resolving ArNS name:", arnsName, task.error)
        }
      }

      try {
        await crawler.start({
          taskId: task.id,
          initialRequests,
          extractHashUrls: taskConfig.extractHashUrls,
          pageDataHandler: this.#pageDataHandler.bind(this),
          scrapingErrorHandler: this.#scrapingErrorHandler.bind(this),
          resolveUrlHandler: this.#resolveUrlHandler.bind(this),
        })
      } catch (error) {
        task.error = error instanceof Error ? error.message : String(error)
        return console.error("[CrawlingService] ", task.id, task.error)
      }

      try {
        await store.export()
      } catch (error) {
        task.error = error instanceof Error ? error.message : String(error)
        console.error("[CrawlingService] Error exporting data for task:", task.id, task.error)
      }

      await store.close()
      delete this.#stores[task.id]

      task.finishedAt = Date.now()
      console.info("[CrawlingService] Task finished:", task.id, task.pageCount, "pages stored")
    }, 100)

    console.info("[CrawlingService] Task created:", task.id)
    this.#tasks[task.id] = task
    return task
  }

  // called by CrawlerPort
  async #pageDataHandler(pageData: CrawlerPort.CrawlerPageData) {
    const htmlData = await this.#utils.pageDataExtractor.extract(pageData.html)

    const arweaveTxId = pageData.headers.find((header) => header.name === "x-ar-io-data-id")?.value

    if (!arweaveTxId) throw new Error("Missing x-ar-io-data-id header for: " + pageData.gatewayUrl)

    // sort found URLs, but don't use local compare, the sorting needs to be stable across different environments
    pageData.foundUrls.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    )

    const storageSuccess = await this.#stores[pageData.taskId]?.save({
      ...htmlData,
      txId: arweaveTxId,
      arnsName: pageData.arnsName,
      wayfinderUrl: pageData.wayfinderUrl,
      gatewayUrl: pageData.gatewayUrl,
      headers: pageData.headers,
      relativeUrls: pageData.foundUrls.filter((url) => url.startsWith("/")),
      absoluteUrls: pageData.foundUrls.filter((url) => !url.startsWith("/")),
    })

    const task = this.#tasks[pageData.taskId]
    if (task && storageSuccess) task.pageCount++
  }

  // called by CrawlerPort for every new URL
  // Updates URLs to a new gateway
  async #resolveUrlHandler(oldGatewayUrl: Entities.GatewayUrl) {
    const wayfinderUrl = await this.#inputs.arnsResolver.dissolve(oldGatewayUrl)
    const gatewayUrl = await this.#inputs.arnsResolver.resolve(wayfinderUrl)
    return { gatewayUrl, wayfinderUrl }
  }

  // called by CrawlerPort
  async #scrapingErrorHandler(input: CrawlerPort.CrawlerErrorHandlerData) {
    const wayfinderUrl = await this.#inputs.arnsResolver.dissolve(input.failedUrl)
    let newGatewayUrl: Entities.GatewayUrl
    do {
      // choose new gateway for failed URL
      newGatewayUrl = await this.#inputs.arnsResolver.resolve(wayfinderUrl)
    } while (newGatewayUrl === input.failedUrl)

    console.error(`[CrawlingService] Failed: ${input.failedUrl}`)
    console.error(`[CrawlingService] Retrying as: ${newGatewayUrl}`)

    return newGatewayUrl
  }
}
