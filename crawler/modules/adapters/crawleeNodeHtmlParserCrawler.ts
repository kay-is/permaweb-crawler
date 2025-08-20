import * as Crawlee from "crawlee"
import * as NodeHtmlParser from "node-html-parser"

import * as Utils from "../utils.js"
import * as Entities from "../entities.js"
import type * as Crawler from "../ports/crawler.js"
import * as CustomRequestQueue from "./crawleeCustomRequestQueue.js"

Crawlee.log.setLevel(Crawlee.LogLevel.SOFT_FAIL)

export default class CrawleeNodeHtmlParserCrawler implements Crawler.CrawlerInput {
  #log = Utils.getLogger("CrawleeNodeHtmlParserCrawler")

  #taskId?: string
  #extractHashUrls?: boolean

  #pageDataHandler?: Crawler.CrawlerPageDataHandler
  #scrapingErrorHandler?: Crawler.CrawlerScrapingErrorHandler

  async start(config: Crawler.CrawlerConfig) {
    return Utils.tryCatch(async () => {
      this.#log.debug({ msg: "starting crawler", config })

      this.#taskId = config.taskId
      this.#extractHashUrls = config.extractHashUrls

      const customRequestQueue = await CustomRequestQueue.open(config)

      this.#pageDataHandler = config.pageDataHandler
      this.#scrapingErrorHandler = config.scrapingErrorHandler

      const crawler = new Crawlee.BasicCrawler({
        requestHandlerTimeoutSecs: 5,
        maxConcurrency: 10,
        maxRequestRetries: 5,
        respectRobotsTxtFile: true,
        maxCrawlDepth: config.maxDepth,
        maxRequestsPerCrawl: config.maxPages,
        requestQueue: customRequestQueue,
        requestHandler: this.#basicRequestHandler.bind(this),
        errorHandler: this.#basicErrorHandler.bind(this),
      })

      const result = await crawler.run(
        // the crawler only understands HTTP/gatway URLs, but accepts any string as uniqueKey
        config.initialRequests.map(({ gatewayUrl, wayfinderUrl }) => ({
          url: gatewayUrl,
          uniqueKey: wayfinderUrl,
        })),
      )

      this.#log.info({ msg: "crawler finished", ...result })
    })
  }

  async #basicRequestHandler(context: Crawlee.BasicCrawlingContext) {
    if (!this.#taskId) throw new Error("taskId not set!")
    if (!this.#pageDataHandler) throw new Error("pageDataHandler not set!")

    const response = await context.sendRequest()
    const dom = NodeHtmlParser.parse(response.body)

    let foundUrls = dom
      .querySelectorAll("a[href]")
      .map((anchor) => {
        const href = anchor.getAttribute("href")
        return href ? decodeURIComponent(href) : ""
      })
      .filter((url) => url !== "/" && !!url)

    if (!this.#extractHashUrls)
      foundUrls = foundUrls.map((url) => url.split("#").shift() ?? "").filter((url) => !!url)

    const html = response.body
    const headers = response.headers ?? {}

    for (const header in headers) if (headers[header] === undefined) delete headers[header]

    const headersArray = Object.entries(headers).map(([name, value]) => ({
      name,
      value: value as string,
    }))

    const handlingPageData = await this.#pageDataHandler({
      taskId: this.#taskId,
      arnsName: context.request.uniqueKey.split("/")[2] ?? "",
      wayfinderUrl: context.request.uniqueKey as Entities.WayfinderUrl,
      gatewayUrl: context.request.url as Entities.GatewayUrl,
      html,
      foundUrls,
      headers: headersArray,
    })

    if (handlingPageData.failed) throw handlingPageData.error

    const relativeUrls = foundUrls
      .filter((url) => url.startsWith("/") || url.startsWith("./") || url.startsWith("#/"))
      .map((url) => new URL(url, context.request.url).href)

    await context.enqueueLinks({ urls: relativeUrls })
  }

  async #basicErrorHandler(context: Crawlee.BasicCrawlingContext) {
    if (!this.#scrapingErrorHandler) throw new Error("scrapingErrorHandler not set")

    const { url, retryCount, maxRetries, errorMessages } = context.request
    const resolvingNewUrl = await this.#scrapingErrorHandler({
      taskId: this.#taskId!,
      failedUrl: url as Entities.GatewayUrl,
      retryCount,
      maxRetries: maxRetries ?? 0,
      errorMessages,
    })

    if (resolvingNewUrl.failed) throw resolvingNewUrl.error

    context.request.url = resolvingNewUrl.data
  }
}
