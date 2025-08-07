import type { BrowserCrawlingContext, PlaywrightCrawlingContext } from "crawlee"
import { PlaywrightCrawler, RequestQueue } from "crawlee"
import { chromium } from "playwright-core"

import type { CrawlerHandlers, CrawlerPort } from "../ports/crawler.js"
import type { GatewayUrl, WayfinderUrl } from "../entities.js"

export class BrowserCrawlerAdapter implements CrawlerPort {
  #taskId?: string
  #extractHashUrls = false
  #requestQueue?: RequestQueue

  #scrapingHandler?: CrawlerHandlers["Scraping"]
  set scrapingHandler(callback: CrawlerHandlers["Scraping"]) {
    this.#scrapingHandler = callback
  }

  #errorHandler?: CrawlerHandlers["Error"]
  set scrapingErrorHandler(callback: CrawlerHandlers["Error"]) {
    this.#errorHandler = callback
  }

  async start(taskId: string, initialRequests: { url: string; uniqueKey: string }[]) {
    this.#taskId = taskId
    this.#requestQueue = await RequestQueue.open(taskId)

    const crawler = new PlaywrightCrawler({
      requestQueue: this.#requestQueue,
      launchContext: { launcher: chromium },
      requestHandler: this.playwrightRequestHandler,
      errorHandler: this.playwrightErrorHandler,
    })

    await crawler.run(initialRequests)
  }

  playwrightRequestHandler = async (context: PlaywrightCrawlingContext) => {
    if (!this.#taskId) throw new Error("taskId not set!")
    if (!this.#scrapingHandler) throw new Error("scrapingHandler not set!")

    const html = await context.page.content()
    const headers = (await context.response?.headers()) ?? {}
    const headersArray = Object.entries(headers).map(([name, value]) => ({ name, value }))

    let foundUrls = await context.page
      // ensures page JS was executed before selecting elements
      .locator("a[href]")
      // performs URL extraction inside browser
      .evaluateAll((anchors) =>
        anchors
          .map((anchor) => decodeURIComponent(anchor.getAttribute("href") ?? ""))
          .filter((url) => url !== "/" && !!url),
      )

    if (!this.#extractHashUrls)
      foundUrls = foundUrls.map((url) => url.split("#").shift() ?? "").filter((url) => !!url)

    const newRequests = await this.#scrapingHandler({
      taskId: this.#taskId,
      wayfinderUrl: context.request.uniqueKey as WayfinderUrl,
      gatewayUrl: context.request.url as GatewayUrl,
      html,
      foundUrls,
      headers: headersArray,
    })

    await this.#requestQueue?.addRequests(newRequests)
  }

  playwrightErrorHandler = async (context: BrowserCrawlingContext) => {
    console.log("errorcb", this)
    if (!this.#errorHandler) throw Error("errorHandler not set!")

    const { url, retryCount, errorMessages } = context.request
    const newUrl = await this.#errorHandler({
      failedUrl: url as GatewayUrl,
      retryCount,
      errorMessages,
    })

    context.request.url = newUrl
  }
}
