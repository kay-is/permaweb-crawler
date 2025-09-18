import * as v from "valibot"
import * as Crawlee from "crawlee"

import * as Entities from "../entities.js"
import type * as Crawler from "../ports/crawler.js"
import * as Utils from "../utils.js"

export type CustomRequestQueueConfig = {
  taskId: string
  extractHashUrls?: boolean
  resolveUrlHandler: Crawler.CrawlerResolveUrlHandler
}

export const open = async (config: CustomRequestQueueConfig) => {
  const log = Utils.getLogger("CrawleeCustomRequestQueue")
  log.debug({ msg: "opening queue", config })
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
        log.warn({ msg: "invalid gateway URL", taskId: config.taskId, gatewayUrl: oldGatewayUrl })
        continue
      }

      const resolvedUrls = await config.resolveUrlHandler(validUrl)

      if (resolvedUrls.failed) {
        log.warn({ msg: resolvedUrls.error.message, taskId: config.taskId, gatewayUrl: validUrl })
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
