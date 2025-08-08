import * as Crawlee from "crawlee"
import * as Playwright from "playwright-core"

import type * as Entities from "../entities.js"
import type * as CrawlerPort from "../ports/crawler.js"

export class CrawleePlaywrightCrawlerAdapter implements CrawlerPort.CrawlerInput {
  #taskId?: string
  #extractHashUrls?: boolean
  #requestQueue?: Crawlee.RequestQueue

  #pageDataHandler?: CrawlerPort.PageDataHandler
  #scrapingErrorHandler?: CrawlerPort.ScrapingErrorHandler

  async start(config: CrawlerPort.CrawlerConfig) {
    this.#taskId = config.taskId
    this.#extractHashUrls = config.extractHashUrls
    this.#requestQueue = await Crawlee.RequestQueue.open(config.taskId)

    this.#pageDataHandler = config.pageDataHandler
    this.#scrapingErrorHandler = config.scrapingErrorHandler

    const crawler = new Crawlee.PlaywrightCrawler({
      requestQueue: this.#requestQueue,
      launchContext: { launcher: Playwright.chromium },
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
  }

  async #playwrightRequestHandler(context: Crawlee.PlaywrightCrawlingContext) {
    if (!this.#taskId) throw new Error("taskId not set!")
    if (!this.#pageDataHandler) throw new Error("scrapingHandler not set!")

    // the locator() call ensures page JS was executed before selecting elements
    // which is vital for the content() call below.
    let foundUrls = await context.page
      .locator("a[href]")
      // performs URL extraction inside browser
      .evaluateAll((anchors) =>
        anchors
          .map((anchor) => decodeURIComponent(anchor.getAttribute("href") ?? ""))
          .filter((url) => url !== "/" && !!url),
      )

    if (!this.#extractHashUrls)
      foundUrls = foundUrls.map((url) => url.split("#").shift() ?? "").filter((url) => !!url)

    // requires a locator() call for client-side rendered pages
    const html = await context.page.content()
    const headers = (await context.response?.headers()) ?? {}
    const headersArray = Object.entries(headers).map(([name, value]) => ({ name, value }))

    const newRequests = await this.#pageDataHandler({
      taskId: this.#taskId,
      wayfinderUrl: context.request.uniqueKey as Entities.WayfinderUrl,
      gatewayUrl: context.request.url as Entities.GatewayUrl,
      html,
      foundUrls,
      headers: headersArray,
    })

    await this.#requestQueue?.addRequests(newRequests)
  }

  async #playwrightErrorHandler(context: Crawlee.BrowserCrawlingContext) {
    if (!this.#scrapingErrorHandler) throw Error("errorHandler not set!")

    const { url, retryCount, errorMessages } = context.request
    const newUrl = await this.#scrapingErrorHandler({
      failedUrl: url as Entities.GatewayUrl,
      retryCount,
      errorMessages,
    })

    context.request.url = newUrl
  }
}
