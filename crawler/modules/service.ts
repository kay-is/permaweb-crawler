import type * as Entities from "./entities.js"
import type * as ApiPort from "./ports/api.js"
import type * as CrawlerPort from "./ports/crawler.js"
import type * as ExtractorPort from "./ports/extractor.js"
import type * as ResolverPort from "./ports/resolver.js"
import type * as StoragePort from "./ports/storage.js"

export interface CrawlingServiceConfig {
  adapters: {
    inputs: {
      api: ApiPort.ApiInput
      crawlers: Record<Entities.CrawlerTypes, CrawlerPort.CrawlerInput>
    }
    utils: {
      extractor: ExtractorPort.ExtractorUtil
      resolver: ResolverPort.ResolverUtil
    }
    outputs: {
      storage: StoragePort.StorageOutput
    }
  }
}

export class CrawlingService {
  #inputs: CrawlingServiceConfig["adapters"]["inputs"]
  #utils: CrawlingServiceConfig["adapters"]["utils"]
  #outputs: CrawlingServiceConfig["adapters"]["outputs"]

  #stores: Record<string, StoragePort.ResultStore> = {}

  static async start(config: CrawlingServiceConfig) {
    return new CrawlingService(config).start()
  }

  constructor(config: CrawlingServiceConfig) {
    this.#inputs = config.adapters.inputs
    this.#utils = config.adapters.utils
    this.#outputs = config.adapters.outputs
  }

  async start() {
    await this.#inputs.api.start({
      createTask: this.#createTaskHandler.bind(this),
    })
  }

  // called by ApiPort
  async #createTaskHandler(taskConfig: Entities.CrawlTaskConfig): Promise<Entities.CrawlTask> {
    const task = { ...taskConfig, id: crypto.randomUUID() }

    const crawler = this.#inputs.crawlers["browser"]

    setTimeout(async () => {
      this.#stores[task.id] = await this.#outputs.storage.open(task.id)

      let initialRequests: CrawlerPort.CrawlerRequest[] = []
      for (const arnsName of taskConfig.arnsNames) {
        initialRequests.push({
          wayfinderUrl: `ar://${arnsName}`,
          gatewayUrl: await this.#utils.resolver.resolve(arnsName),
        })
      }

      await crawler.start({
        taskId: task.id,
        initialRequests,
        extractHashUrls: taskConfig.extractHashUrls,
        pageDataHandler: this.#pageDataHandler.bind(this),
        scrapingErrorHandler: this.#scrapingErrorHandler.bind(this),
      })
    }, 100)

    console.info("[CrawlingService] Task created:", task.id)
    return task
  }

  // called by CrawlerPort
  async #pageDataHandler(pageData: CrawlerPort.CrawlerPageData) {
    const store = this.#stores[pageData.taskId]
    if (!store) throw Error("No store found for task ID:" + pageData.taskId)

    const htmlData = await this.#utils.extractor.extract(pageData.html)

    const arweaveTxId =
      pageData.headers.find((header) => header.name === "x-arns-resolved-id")?.value ??
      "x-arns-resolved-id header missing"
    await store.save({
      ...htmlData,
      txId: arweaveTxId,
      wayfinderUrl: pageData.wayfinderUrl,
      gatewayUrl: pageData.gatewayUrl,
      headers: pageData.headers,
      relativeUrls: pageData.foundUrls.filter((url) => url.startsWith("/")),
      absoluteUrls: pageData.foundUrls.filter((url) => !url.startsWith("/")),
    })

    const newRequests: any[] = []
    for (const foundUrl of pageData.foundUrls) {
      // only crawl relative URLs
      if (!foundUrl.startsWith("/")) continue

      // choose new gateway for new URLs
      const foundWayfinderUrl = await this.#utils.resolver.desolve(
        new URL(foundUrl, pageData.gatewayUrl),
      )
      const foundGatewayUrl = await this.#utils.resolver.resolve(foundWayfinderUrl)

      newRequests.push({
        url: foundGatewayUrl,
        uniqueKey: foundWayfinderUrl,
      })
    }
    return newRequests
  }

  // called by CrawlerPort
  async #scrapingErrorHandler(input: CrawlerPort.CrawlerErrorHandlerData) {
    const wayfinderUrl = await this.#utils.resolver.desolve(input.failedUrl)
    let newGatewayUrl: Entities.GatewayUrl
    do {
      // choose new gateway for failed URL
      newGatewayUrl = await this.#utils.resolver.resolve(wayfinderUrl)
    } while (newGatewayUrl === input.failedUrl)

    console.error(`[CrawlingService] Failed: ${input.failedUrl}`)
    console.error(`[CrawlingService] Retrying as: ${newGatewayUrl}`)

    return newGatewayUrl
  }
}
