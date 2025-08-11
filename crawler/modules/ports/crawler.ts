import type * as Entities from "../entities.js"

export type CrawlerRequest = {
  gatewayUrl: Entities.GatewayUrl
  wayfinderUrl: Entities.WayfinderUrl
}

export type CrawlerPageData = {
  taskId: string
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

export type PageDataHandler = (pageData: CrawlerPageData) => Promise<void>
export type ScrapingErrorHandler = (errorData: CrawlerErrorHandlerData) => Promise<string>
export type ResolveUrlHandler = (gatewayUrl: Entities.GatewayUrl) => Promise<{gatewayUrl: Entities.GatewayUrl, wayfinderUrl: Entities.WayfinderUrl}>

export type CrawlerConfig = {
  taskId: string
  initialRequests: CrawlerRequest[]
  extractHashUrls: boolean
  pageDataHandler: PageDataHandler
  scrapingErrorHandler: ScrapingErrorHandler
  resolveUrlHandler: ResolveUrlHandler
}

export interface CrawlerInput {
  start(config: CrawlerConfig): Promise<void>
}
