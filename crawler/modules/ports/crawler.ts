import type * as Utils from "../utils.js"
import type * as Entities from "../entities.js"

export type CrawlerRequest = {
  gatewayUrl: Entities.GatewayUrl
  wayfinderUrl: Entities.WayfinderUrl
}

export type CrawlerPageData = {
  taskId: string
  arnsName: string
  wayfinderUrl: Entities.WayfinderUrl
  gatewayUrl: Entities.GatewayUrl
  headers: { name: string; value: string }[]
  html: string
  foundUrls: string[]
}

export type CrawlerScrapingHandlerOutput = {
  url: Entities.GatewayUrl
  uniqueKey: Entities.WayfinderUrl
}

export type CrawlerErrorHandlerData = {
  failedUrl: Entities.GatewayUrl
  retryCount: number
  errorMessages: string[]
}

export type CrawlerPageDataHandler = (pageData: CrawlerPageData) => Utils.PromisedEmptyResult
export type CrawlerScrapingErrorHandler = (
  errorData: CrawlerErrorHandlerData,
) => Utils.PromisedResult<string>
export type CrawlerResolveUrlHandler = (
  gatewayUrl: Entities.GatewayUrl,
) => Utils.PromisedResult<{ gatewayUrl: Entities.GatewayUrl; wayfinderUrl: Entities.WayfinderUrl }>

export type CrawlerConfig = {
  taskId: string
  initialRequests: CrawlerRequest[]
  extractHashUrls: boolean
  maxDepth: number
  maxPages: number
  pageDataHandler: CrawlerPageDataHandler
  scrapingErrorHandler: CrawlerScrapingErrorHandler
  resolveUrlHandler: CrawlerResolveUrlHandler
}

export interface CrawlerInput {
  start(config: CrawlerConfig): Utils.PromisedEmptyResult
}
