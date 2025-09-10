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
    this.#log.debug({ msg: "starting crawler", config })

    this.#taskId = config.taskId
    this.#extractHashUrls = config.extractHashUrls

    this.#pageDataHandler = config.pageDataHandler
    this.#scrapingErrorHandler = config.scrapingErrorHandler

    const result = await Utils.tryCatch(async () => {
      const customRequestQueue = await CustomRequestQueue.open(config)

      const crawler = new Crawlee.BasicCrawler({
        requestHandlerTimeoutSecs: 5,
        maxConcurrency: 20,
        minConcurrency: 5,
        maxRequestRetries: 2,
        respectRobotsTxtFile: false,
        maxCrawlDepth: config.maxDepth,
        maxRequestsPerCrawl: config.maxPages,
        requestQueue: customRequestQueue,
        requestHandler: this.#basicRequestHandler.bind(this),
        errorHandler: this.#basicErrorHandler.bind(this),
      })

      // the crawler only understands HTTP/gatway URLs, but accepts any string as uniqueKey
      const initialRequests = config.initialRequests.map(({ gatewayUrl, wayfinderUrl }) => ({
        url: gatewayUrl,
        uniqueKey: wayfinderUrl,
      }))

      return await crawler.run(initialRequests)
    })

    if (result.failed) return result

    this.#log.info({ msg: "crawler finished", ...result.data })

    return Utils.empty()
  }

  // called by Crawlee for each request
  async #basicRequestHandler(context: Crawlee.BasicCrawlingContext) {
    const arnsName = (context.request.uniqueKey.split("/")[2] ?? "")
      .trim()
      .toLowerCase() as Entities.ArnsName

    const response = await context.sendRequest()

    // requests with error status will be retried on different gateway before finally failing
    if (response.statusCode >= 400) throw new Error(`Received status ${response.statusCode}`)

    const dom = NodeHtmlParser.parse(response.body)

    const headers = response.headers ?? {}
    for (const header in headers) if (headers[header] === undefined) delete headers[header]

    const headersArray = Object.entries(headers)
      .map(([name, value]) => ({
        name: name.trim().toLowerCase(),
        value: ("" + value).trim().toLowerCase(),
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      )

    let foundUrls = dom
      .querySelectorAll("a[href]")
      .map((anchor) => {
        const href = anchor.getAttribute("href")
        const url = href ? decodeURIComponent(href) : ""
        return url.trim().toLowerCase()
      })
      .filter((url, index, array) => array.indexOf(url) === index)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))

    if (!this.#extractHashUrls)
      foundUrls = foundUrls.map((url) => url.split("#").shift() ?? "").filter((url) => !!url)

    const handlingPageData = await this.#pageDataHandler?.({
      taskId: this.#taskId ?? "N/A",
      arnsName,
      wayfinderUrl: context.request.uniqueKey.trim().toLowerCase() as Entities.WayfinderUrl,
      gatewayUrl: context.request.url.trim().toLowerCase() as Entities.GatewayUrl,
      html: response.body,
      foundUrls,
      headers: headersArray,
    })

    if (handlingPageData?.failed) throw handlingPageData.error

    const relativeUrls = foundUrls
      .filter((url) => url !== "/" && !!url) // remove empty and homepage links
      .filter((url) => url.startsWith("/") || url.startsWith("./") || url.startsWith("#/"))
      .map((url) => new URL(url, context.request.url).href)

    await context.enqueueLinks({ urls: relativeUrls })
  }

  async #basicErrorHandler(context: Crawlee.BasicCrawlingContext) {
    const { url, retryCount, maxRetries, errorMessages } = context.request
    const resolvingNewUrl = await this.#scrapingErrorHandler?.({
      taskId: this.#taskId!,
      failedUrl: url as Entities.GatewayUrl,
      retryCount,
      maxRetries: maxRetries ?? 0,
      errorMessages,
    })

    if (resolvingNewUrl?.failed) throw resolvingNewUrl.error
    if (resolvingNewUrl?.data) context.request.url = resolvingNewUrl.data
  }
}
