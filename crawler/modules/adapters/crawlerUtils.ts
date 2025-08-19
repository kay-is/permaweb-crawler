import * as Entities from "../entities.js"
import type * as Crawler from "../ports/crawler.js"

/**
 * Common URL processing utilities for crawlers
 */

export interface ProcessedUrls {
  foundUrls: string[]
  headersArray: Array<{ name: string; value: string }>
}

export interface UrlFilters {
  extractHashUrls?: boolean
}

/**
 * Filters and processes URLs based on configuration
 */
export function filterUrls(urls: string[], filters: UrlFilters): string[] {
  let filteredUrls = urls.filter((url) => url !== "/" && !!url)
  
  if (!filters.extractHashUrls) {
    filteredUrls = filteredUrls
      .map((url) => url.split("#").shift() ?? "")
      .filter((url) => !!url)
  }
  
  return filteredUrls
}

/**
 * Converts headers object to array format expected by page data handler
 */
export function convertHeadersToArray(headers: Record<string, string | string[] | undefined>): Array<{ name: string; value: string }> {
  // Remove undefined headers and convert arrays to strings
  const cleanedHeaders: Record<string, string> = {}
  for (const header in headers) {
    const value = headers[header]
    if (value !== undefined) {
      cleanedHeaders[header] = Array.isArray(value) ? value.join(', ') : value
    }
  }
  
  return Object.entries(cleanedHeaders).map(([name, value]) => ({ name, value }))
}

/**
 * Extracts ARNS name from wayfinder URL
 */
export function extractArnsName(wayfinderUrl: string): string {
  return wayfinderUrl.split("/")[2] ?? ""
}

/**
 * Filters URLs to get only relative URLs
 */
export function getRelativeUrls(urls: string[]): string[] {
  return urls.filter((url) => 
    url.startsWith("/") || url.startsWith("./") || url.startsWith("#/")
  )
}

/**
 * Filters URLs to get only absolute URLs
 */
export function getAbsoluteUrls(urls: string[]): string[] {
  return urls.filter((url) => 
    !url.startsWith("/") && !url.startsWith("./") && !url.startsWith("#/")
  )
}

/**
 * Creates page data object for handler
 */
export function createPageData(
  taskId: string,
  wayfinderUrl: string,
  gatewayUrl: string,
  html: string,
  foundUrls: string[],
  headersArray: Array<{ name: string; value: string }>
): Crawler.CrawlerPageData {
  return {
    taskId,
    arnsName: extractArnsName(wayfinderUrl),
    wayfinderUrl: wayfinderUrl as Entities.WayfinderUrl,
    gatewayUrl: gatewayUrl as Entities.GatewayUrl,
    html,
    foundUrls,
    headers: headersArray,
  }
}

/**
 * Common error handler for crawlers
 */
export async function handleCrawlerError(
  context: { request: { url: string; retryCount: number; maxRetries?: number; errorMessages: string[] } },
  taskId: string,
  scrapingErrorHandler: Crawler.CrawlerScrapingErrorHandler
): Promise<string> {
  const { url, retryCount, maxRetries, errorMessages } = context.request
  
  const resolvingNewUrl = await scrapingErrorHandler({
    taskId,
    failedUrl: url as Entities.GatewayUrl,
    retryCount,
    maxRetries: maxRetries ?? 0,
    errorMessages,
  })

  if (resolvingNewUrl.failed) throw resolvingNewUrl.error

  return resolvingNewUrl.data
}