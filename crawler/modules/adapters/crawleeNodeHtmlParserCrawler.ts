import * as Crawlee from "crawlee"
import * as NodeHtmlParser from "node-html-parser"

import * as Utils from "../utils.js"
import * as Entities from "../entities.js"
import type * as Crawler from "../ports/crawler.js"
import * as CustomRequestQueue from "./crawleeCustomRequestQueue.js"
import * as CrawlerUtils from "./crawlerUtils.js"
import * as LoggingUtils from "./loggingUtils.js"

Crawlee.log.setLevel(Crawlee.LogLevel.SOFT_FAIL)

export default class CrawleeNodeHtmlParserCrawler implements Crawler.CrawlerInput {
  #taskId?: string
  #extractHashUrls?: boolean

  #pageDataHandler?: Crawler.CrawlerPageDataHandler
  #scrapingErrorHandler?: Crawler.CrawlerScrapingErrorHandler

  async start(config: Crawler.CrawlerConfig) {
    return Utils.tryCatch(async () => {
      LoggingUtils.logInfo(LoggingUtils.createCrawlerStartLog("CrawleeNodeHtmlParserCrawler", config))

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

      await crawler.run(
        // the crawler only understands HTTP/gatway URLs, but accepts any string as uniqueKey
        config.initialRequests.map(({ gatewayUrl, wayfinderUrl }) => ({
          url: gatewayUrl,
          uniqueKey: wayfinderUrl,
        })),
      )
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

    foundUrls = CrawlerUtils.filterUrls(foundUrls, { extractHashUrls: this.#extractHashUrls })

    const html = response.body
    const headers = response.headers ?? {}
    const headersArray = CrawlerUtils.convertHeadersToArray(headers)

    const pageData = CrawlerUtils.createPageData(
      this.#taskId,
      context.request.uniqueKey,
      context.request.url,
      html,
      foundUrls,
      headersArray
    )

    const handlingPageData = await this.#pageDataHandler(pageData)

    if (handlingPageData.failed) throw handlingPageData.error

    const relativeUrls = CrawlerUtils.getRelativeUrls(foundUrls)
      .map((url) => new URL(url, context.request.url).href)

    await context.enqueueLinks({ urls: relativeUrls })
  }

  async #basicErrorHandler(context: Crawlee.BasicCrawlingContext) {
    if (!this.#scrapingErrorHandler) throw new Error("scrapingErrorHandler not set")

    const newUrl = await CrawlerUtils.handleCrawlerError(
      context,
      this.#taskId!,
      this.#scrapingErrorHandler
    )

    context.request.url = newUrl
  }
}
