import type { GatewayUrl, WayfinderUrl } from "../entities.js"

export type CrawlerRequest = {
  gatewayUrl: GatewayUrl
  wayfinderUrl: WayfinderUrl
}

export type CrawlerPageData = {
  taskId: string
  wayfinderUrl: WayfinderUrl
  gatewayUrl: GatewayUrl
  headers: { name: string; value: string }[]
  html: string
  foundUrls: string[]
}

export type CrawlerScrapingHandlerOutput = {
  url: GatewayUrl
  uniqueKey: WayfinderUrl
}

export type CrawlerErrorHandlerData = {
  failedUrl: GatewayUrl
  retryCount: number
  errorMessages: string[]
}

export type PageDataHandler = (pageData: CrawlerPageData) => Promise<CrawlerScrapingHandlerOutput[]>
export type ScrapingErrorHandler = (errorData: CrawlerErrorHandlerData) => Promise<string>

export type CrawlerConfig = {
  taskId: string
  initialRequests: CrawlerRequest[]
  extractHashUrls: boolean
  pageDataHandler: PageDataHandler
  scrapingErrorHandler: ScrapingErrorHandler
}

export interface CrawlerInput {
  start(config: CrawlerConfig): Promise<void>
}
