import type { GatewayUrl, WayfinderUrl } from "../entities.js"

export type CrawlerScrapingHandlerInput = {
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

export type CrawlerErrorHandlerInput = {
  failedUrl: GatewayUrl
  retryCount: number
  errorMessages: string[]
}

export type CrawlerHandlers = {
  Scraping: (input: CrawlerScrapingHandlerInput) => Promise<CrawlerScrapingHandlerOutput[]>
  Error: (input: CrawlerErrorHandlerInput) => Promise<string>
}

export interface CrawlerPort {
  start(taskId: string, requests: { url: string; uniqueKey: string }[]): Promise<void>
  set scrapingHandler(callback: CrawlerHandlers["Scraping"])
  set scrapingErrorHandler(callback: CrawlerHandlers["Error"])
}
