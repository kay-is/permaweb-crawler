import * as Crawlee from "crawlee"
import * as Playwright from "playwright-core"

import * as Utils from "../utils.js"
import * as Entities from "../entities.js"
import type * as Crawler from "../ports/crawler.js"
import * as CustomRequestQueue from "./crawleeCustomRequestQueue.js"
import * as CrawlerUtils from "./crawlerUtils.js"
import * as LoggingUtils from "./loggingUtils.js"

Crawlee.log.setLevel(Crawlee.LogLevel.SOFT_FAIL)

export default class CrawleePlaywrightCrawler implements Crawler.CrawlerInput {
  #taskId?: string
  #extractHashUrls?: boolean

  #pageInitHandler?: Crawler.CrawlerPageInitHandler
  #pageDataHandler?: Crawler.CrawlerPageDataHandler
  #scrapingErrorHandler?: Crawler.CrawlerScrapingErrorHandler

  async start(config: Crawler.CrawlerConfig) {
    return Utils.tryCatch(async () => {
      LoggingUtils.logInfo(LoggingUtils.createCrawlerStartLog("CrawleePlaywrightCrawler", config))

      this.#taskId = config.taskId
      this.#extractHashUrls = config.extractHashUrls

      const customRequestQueue = await CustomRequestQueue.open(config)

      this.#pageInitHandler = config.pageInitHandler
      this.#pageDataHandler = config.pageDataHandler
      this.#scrapingErrorHandler = config.scrapingErrorHandler

      const crawler = new Crawlee.PlaywrightCrawler({
        sameDomainDelaySecs: 1,
        navigationTimeoutSecs: 10,
        requestQueue: customRequestQueue,
        maxConcurrency: 5,
        maxRequestRetries: 5,
        respectRobotsTxtFile: true,
        maxCrawlDepth: config.maxDepth,
        maxRequestsPerCrawl: config.maxPages,
        launchContext: {
          launcher: Playwright.chromium,
        },
        requestHandler: this.#playwrightRequestHandler.bind(this),
        errorHandler: this.#playwrightErrorHandler.bind(this),
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

  async #playwrightRequestHandler(context: Crawlee.PlaywrightCrawlingContext) {
    if (!this.#taskId) throw new Error("taskId not set!")
    if (!this.#pageDataHandler) throw new Error("pageDataHandler not set!")
    if (!this.#pageInitHandler) throw new Error("pageInitHandler not set!")

    await context.page.addInitScript(this.#pageInitHandler)

    if (this.#extractHashUrls) await context.page.waitForLoadState("networkidle", { timeout: 5000 })

    // the locator() call ensures page JS was executed before selecting elements
    // which is vital for the content() call below.
    let foundUrls = await context.page
      .locator("a[href]")
      // performs URL extraction inside browser
      .evaluateAll((anchors) =>
        anchors
          .map((anchor) => decodeURIComponent(anchor.getAttribute("href") ?? ""))
      )

    foundUrls = CrawlerUtils.filterUrls(foundUrls, { extractHashUrls: this.#extractHashUrls })

    // requires a locator() call for client-side rendered pages
    const html = await context.page.content()
    const headers = (await context.response?.allHeaders()) ?? {}
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

    await context.enqueueLinks()
  }

  async #playwrightErrorHandler(context: Crawlee.BrowserCrawlingContext) {
    if (!this.#scrapingErrorHandler) throw new Error("scrapingErrorHandler not set")

    const newUrl = await CrawlerUtils.handleCrawlerError(
      context,
      this.#taskId!,
      this.#scrapingErrorHandler
    )

    context.request.url = newUrl
  }
}
