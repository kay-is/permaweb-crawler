import * as v from "valibot"
import * as Crawlee from "crawlee"
import * as Playwright from "playwright-core"

import * as Utils from "../utils.js"
import * as Entities from "../entities.js"
import type * as Crawler from "../ports/crawler.js"

Crawlee.log.setLevel(Crawlee.LogLevel.WARNING)

export default class CrawleePlaywrightCrawler implements Crawler.CrawlerInput {
  #taskId?: string
  #extractHashUrls?: boolean

  #pageDataHandler?: Crawler.CrawlerPageDataHandler
  #scrapingErrorHandler?: Crawler.CrawlerScrapingErrorHandler

  async start(config: Crawler.CrawlerConfig) {
    return Utils.tryCatch(async () => {
      this.#taskId = config.taskId
      this.#extractHashUrls = config.extractHashUrls

      const requestQueue = await Crawlee.RequestQueue.open(config.taskId)

      const addRequests = requestQueue.addRequests.bind(requestQueue)

      // Override addRequests to update the gateway of the found URLs
      // and change the unqieKey to WayfinderUrls to ensure uniqueness
      requestQueue.addRequests = async (requests) => {
        const updatedRequests: Crawlee.Source[] = []
        for await (const request of requests) {
          const oldGatewayUrl = typeof request === "string" ? request : request.url
          if (!oldGatewayUrl) continue

          if (!config.extractHashUrls && oldGatewayUrl.includes("#")) continue
          if (config.extractHashUrls && oldGatewayUrl.split("#").length > 2) continue

          // TODO: Improve URL validation
          const validUrl = v.parse(Entities.gatewayUrlSchema, oldGatewayUrl) as
            | Entities.GatewayUrl
            | undefined
          if (!validUrl) {
            console.warn(`[CrawleePlaywrightCrawler] Invalid gateway URL: ${oldGatewayUrl}`)
            continue
          }

          const resolvedUrls = await config.resolveUrlHandler(validUrl)

          if (resolvedUrls.failed) {
            console.warn("[CrawleePlaywrightCrawler]", resolvedUrls.error.message)
            continue
          }

          updatedRequests.push({
            url: resolvedUrls.data.gatewayUrl,
            uniqueKey: resolvedUrls.data.wayfinderUrl,
          })
        }

        return addRequests(updatedRequests)
      }

      this.#pageDataHandler = config.pageDataHandler
      this.#scrapingErrorHandler = config.scrapingErrorHandler

      const crawler = new Crawlee.PlaywrightCrawler({
        requestQueue,
        maxConcurrency: 10,
        maxRequestRetries: 5,
        respectRobotsTxtFile: true,
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
    })
  }

  async #playwrightRequestHandler(context: Crawlee.PlaywrightCrawlingContext) {
    if (!this.#taskId) throw new Error("taskId not set!")
    if (!this.#pageDataHandler) throw new Error("scrapingHandler not set!")

    if (this.#extractHashUrls) await context.page.waitForLoadState("networkidle")

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
    const headers = (await context.response?.allHeaders()) ?? {}
    const headersArray = Object.entries(headers).map(([name, value]) => ({ name, value }))

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

    await context.enqueueLinks()
  }

  async #playwrightErrorHandler(context: Crawlee.BrowserCrawlingContext) {
    if (!this.#scrapingErrorHandler)
      throw new Error("[CrawleePlaywrightCrawler] scrapingErrorHandler not set")

    const { url, retryCount, errorMessages } = context.request
    const resolvingNewUrl = await this.#scrapingErrorHandler({
      failedUrl: url as Entities.GatewayUrl,
      retryCount,
      errorMessages,
    })

    if (resolvingNewUrl.failed) throw resolvingNewUrl.error

    context.request.url = resolvingNewUrl.data
  }
}
