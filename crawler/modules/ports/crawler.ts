import type * as Utils from "../utils.js"
import type * as Entities from "../entities.js"

export type CrawlerRequest = {
  gatewayUrl: Entities.GatewayUrl
  wayfinderUrl: Entities.WayfinderUrl
}

export type CrawlerPageData = {
  taskId: string
  arnsName: string
  resolvedId: string
  dataId: string
  wayfinderUrl: Entities.WayfinderUrl
  gatewayUrl: Entities.GatewayUrl
  html: string
  foundUrls: string[]
}

export type CrawlerScrapingHandlerOutput = {
  url: Entities.GatewayUrl
  uniqueKey: Entities.WayfinderUrl
}

export type CrawlerErrorHandlerData = {
  taskId: string
  failedUrl: Entities.GatewayUrl
  retryCount: number
  maxRetries: number
  errorMessages: string[]
}

export type CrawlerPageInitHandler = () => void
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
  pageInitHandler: CrawlerPageInitHandler
  pageDataHandler: CrawlerPageDataHandler
  scrapingErrorHandler: CrawlerScrapingErrorHandler
  resolveUrlHandler: CrawlerResolveUrlHandler
}

export interface CrawlerInput {
  start(config: CrawlerConfig): Utils.PromisedEmptyResult
}
