import * as Crawlee from "crawlee"
import * as Playwright from "playwright-core"

import * as Utils from "../utils.js"
import * as Entities from "../entities.js"
import type * as Crawler from "../ports/crawler.js"
import * as CustomRequestQueue from "./crawleeCustomRequestQueue.js"

Crawlee.log.setLevel(Crawlee.LogLevel.SOFT_FAIL)

export default class CrawleePlaywrightCrawler implements Crawler.CrawlerInput {
  #log = Utils.getLogger("CrawleePlaywrightCrawler")

  #taskId?: string
  #extractHashUrls?: boolean

  #pageInitHandler?: Crawler.CrawlerPageInitHandler
  #pageDataHandler?: Crawler.CrawlerPageDataHandler
  #scrapingErrorHandler?: Crawler.CrawlerScrapingErrorHandler

  async start(config: Crawler.CrawlerConfig) {
    this.#log.debug({ msg: "starting crawler", config })

    this.#taskId = config.taskId
    this.#extractHashUrls = config.extractHashUrls

    const customRequestQueue = await CustomRequestQueue.open(config)

    this.#pageInitHandler = config.pageInitHandler
    this.#pageDataHandler = config.pageDataHandler
    this.#scrapingErrorHandler = config.scrapingErrorHandler

    const crawling = await Utils.tryCatch(async () => {
      const crawler = new Crawlee.PlaywrightCrawler({
        maxConcurrency: 10,
        minConcurrency: 2,
        maxRequestRetries: 2,
        respectRobotsTxtFile: false,
        maxCrawlDepth: config.maxDepth,
        maxRequestsPerCrawl: config.maxPages,
        launchContext: { launcher: Playwright.chromium },
        requestQueue: customRequestQueue,
        requestHandler: this.#playwrightRequestHandler.bind(this),
        errorHandler: this.#playwrightErrorHandler.bind(this),
      })
      // the crawler only understands HTTP/gatway URLs, but accepts any string as uniqueKey
      const initialRequests = config.initialRequests.map(({ gatewayUrl, wayfinderUrl }) => ({
        url: gatewayUrl,
        uniqueKey: wayfinderUrl,
      }))

      return await crawler.run(initialRequests)
    })

    if (crawling.failed) return crawling

    this.#log.info({ msg: "crawler finished", ...crawling.data })

    return Utils.empty()
  }

  async #playwrightRequestHandler(context: Crawlee.PlaywrightCrawlingContext) {
    const arnsName = (context.request.uniqueKey.split("/")[2] ?? "")
      .trim()
      .toLowerCase() as Entities.ArnsName

    if (!!this.#pageInitHandler) await context.page.addInitScript(this.#pageInitHandler)

    const headers = (await context.response?.allHeaders()) ?? {}
    const resolvedId = "" + headers["x-arns-resolved-id"]
    const dataId = "" + headers["x-ar-io-data-id"]

    if (!resolvedId || !dataId) throw new Error("missing ArNS headers")

    // the locator() call ensures page JS was executed before selecting elements
    // which is vital for the content() call below.
    let foundUrls = await context.page
      .locator("a[href]")
      // performs URL extraction inside browser
      .evaluateAll((anchors) =>
        anchors
          .map((anchor) => {
            const href = anchor.getAttribute("href")
            const url = href ? decodeURIComponent(href) : ""
            return url.trim().toLowerCase()
          })
          .filter((url, index, array) => array.indexOf(url) === index)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
      )

    if (!this.#extractHashUrls)
      foundUrls = foundUrls.map((url) => url.split("#").shift() ?? "").filter((url) => !!url)

    // requires a locator() call for client-side rendered pages
    const html = await context.page.content()

    const handlingPageData = await this.#pageDataHandler?.({
      taskId: this.#taskId ?? "N/A",
      arnsName,
      resolvedId,
      dataId,
      wayfinderUrl: context.request.uniqueKey.trim().toLowerCase() as Entities.WayfinderUrl,
      gatewayUrl: context.request.url.trim().toLowerCase() as Entities.GatewayUrl,
      html,
      foundUrls,
    })

    if (handlingPageData?.failed) throw handlingPageData.error

    const relativeUrls = foundUrls
      .filter((url) => url !== "/" && !!url) // remove empty and homepage links
      .filter((url) => url.startsWith("/") || url.startsWith("./") || url.startsWith("#/"))
      .map((url) => new URL(url, context.request.url).href)

    await context.enqueueLinks({ urls: relativeUrls })
  }

  async #playwrightErrorHandler(context: Crawlee.BrowserCrawlingContext) {
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
