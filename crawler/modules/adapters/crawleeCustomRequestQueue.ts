import * as v from "valibot"
import * as Crawlee from "crawlee"

import * as Entities from "../entities.js"
import type * as Crawler from "../ports/crawler.js"
import * as LoggingUtils from "./loggingUtils.js"

export type CustomRequestQueueConfig = {
  taskId: string
  extractHashUrls?: boolean
  resolveUrlHandler: Crawler.CrawlerResolveUrlHandler
}

export const open = async (config: CustomRequestQueueConfig) => {
  const customRequestQueue = await Crawlee.RequestQueue.open(config.taskId)

  const addRequests = customRequestQueue.addRequests.bind(customRequestQueue)

  // Override addRequests to update the gateway of the found URLs
  // and change the unqieKey to WayfinderUrls to ensure uniqueness
  customRequestQueue.addRequests = async (requests) => {
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
        LoggingUtils.logWarn({
          source: "CrawleeCustomRequestQueue",
          message: "Invalid URL",
          context: {
            taskId: config.taskId,
            gatewayUrl: oldGatewayUrl,
          },
        })
        continue
      }

      const resolvedUrls = await config.resolveUrlHandler(validUrl)

      if (resolvedUrls.failed) {
        LoggingUtils.logWarn({
          source: "CrawleeCustomRequestQueue",
          message: "Failed to resolve URL",
          context: {
            taskId: config.taskId,
            gatewayUrl: validUrl,
            error: resolvedUrls.error.message,
          },
        })
        continue
      }

      updatedRequests.push({
        url: resolvedUrls.data.gatewayUrl,
        uniqueKey: resolvedUrls.data.wayfinderUrl,
      })
    }

    return addRequests(updatedRequests)
  }

  return customRequestQueue
}
