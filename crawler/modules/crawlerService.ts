import * as Utils from "./utils.js"
import type { GatewayUrl, TaskEntity } from "./entities.js"
import type { ApiPort } from "./ports/api.js"
import type {
  CrawlerErrorHandlerInput,
  CrawlerPort,
  CrawlerScrapingHandlerInput,
} from "./ports/crawler.js"
import type { ExtractorPort } from "./ports/extractor.js"
import type { ResolverPort } from "./ports/resolver.js"
import type { StoragePort, Storage } from "./ports/storage.js"

export interface CrawlingServiceAdapters {
  api: ApiPort
  crawlers: Record<string, CrawlerPort>
  extractor: ExtractorPort
  resolver: ResolverPort
  storage: StoragePort
}

export class CrawlingService {
  #api: ApiPort
  #crawlers: Record<"browser", CrawlerPort>
  #resolver: ResolverPort
  #extractor: ExtractorPort
  #storage: StoragePort
  #stores: Record<string, Storage> = {}

  static async start(adapters: CrawlingServiceAdapters) {
    const service = new CrawlingService(adapters)
    return service.start()
  }

  constructor(adapters: CrawlingServiceAdapters) {
    this.#api = adapters.api
    this.#api.createTaskHandler = this.#createTask

    this.#crawlers = adapters.crawlers
    this.#crawlers["browser"].scrapingHandler = this.#scrapePageData
    this.#crawlers["browser"].scrapingErrorHandler = this.#handleScrapingError

    this.#extractor = adapters.extractor

    this.#resolver = adapters.resolver

    this.#storage = adapters.storage
  }

  start = async () => {
    await this.#api.start()
  }

  // called by ApiPort
  #createTask = async (taskDefinition: Omit<TaskEntity, "id">): Promise<TaskEntity> => {
    const task = { ...taskDefinition, id: crypto.randomUUID() }

    const crawler = this.#crawlers["browser"]

    setTimeout(async () => {
      this.#stores[task.id] = await this.#storage.open(task.id)

      const requests = taskDefinition.arnsNames.map((arnsName) => ({
        url: `https://${arnsName}.ar.io`,
        uniqueKey: `ar://${arnsName}`,
      }))
      await crawler.start(task.id, requests)
      console.info("[CrawlingService] Task started:", task.id)
    }, 100)

    console.info("[CrawlingService] Task created:", task.id)
    return task
  }

  // called by CrawlerPort
  #scrapePageData = async (input: CrawlerScrapingHandlerInput) => {
    const store = this.#stores[input.taskId]
    if (!store) throw Error("No store found for task ID:" + input.taskId)

    const htmlData = await this.#extractor.extract(input.html)

    await store.save({
      ...htmlData,
      wayfinderUrl: input.wayfinderUrl,
      gatewayUrl: input.gatewayUrl,
      headers: input.headers,
      relativeUrls: input.foundUrls.filter((url) => url.startsWith("/")),
      absoluteUrls: input.foundUrls.filter((url) => !url.startsWith("/")),
    })

    const newRequests: any[] = []
    for (const foundUrl of input.foundUrls) {
      // only crawl relative URLs
      if (!foundUrl.startsWith("/")) continue

      // choose gateway for new URLs
      const foundWayfinderUrl = Utils.httpToWayfinder(new URL(foundUrl, input.gatewayUrl))
      const foundGatewayUrl = await this.#resolver.resolve(foundWayfinderUrl)

      newRequests.push({
        url: foundGatewayUrl,
        uniqueKey: foundWayfinderUrl,
      })
    }
    return newRequests
  }

  // called by CrawlerPort
  #handleScrapingError = async (input: CrawlerErrorHandlerInput) => {
    const wayfinderUrl = Utils.httpToWayfinder(input.failedUrl)

    let newGatewayUrl: GatewayUrl
    do {
      newGatewayUrl = await this.#resolver.resolve(wayfinderUrl)
    } while (newGatewayUrl === input.failedUrl)

    console.error(`[CrawlingService] Failed: ${input.failedUrl}`)
    console.error(`[CrawlingService] Retrying as: ${newGatewayUrl}`)

    return newGatewayUrl
  }
}
