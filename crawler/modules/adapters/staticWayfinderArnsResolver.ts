import * as WayfinderCore from "@ar.io/wayfinder-core"

import * as Utils from "../utils.js"
import type * as Entities from "../entities.js"
import type * as ArnsResolver from "../ports/arnsResolver.js"

export type StaticWayfinderArnsResolverAdapterConfig = {
  gatewayUrls: `https://${string}`[]
}

export default class StaticWayfinderArnsResolver implements ArnsResolver.ArnsResolverInput {
  #wayfinder: WayfinderCore.Wayfinder

  constructor(config: StaticWayfinderArnsResolverAdapterConfig) {
    console.info({
      time: new Date(),
      level: "info",
      source: "StaticWayfinderArnsResolver",
      message: "initializing",
      context: {
        providers: ["StaticGatewaysProvider"],
        gateways: config.gatewayUrls,
      },
    })
    this.#wayfinder = new WayfinderCore.Wayfinder({
      gatewaysProvider: new WayfinderCore.StaticGatewaysProvider({
        gateways: config.gatewayUrls,
      }),
      logger: {
        ...console,
        debug: () => null,
        info: () => null,
      },
    })
  }

  async resolve(urlOrArnsName: Entities.WayfinderUrl | Entities.ArnsName) {
    return Utils.tryCatch(async () => {
      const config = urlOrArnsName.startsWith("ar://")
        ? { wayfinderUrl: urlOrArnsName as Entities.WayfinderUrl }
        : { arnsName: urlOrArnsName }

      const resolvedUrl = await this.#wayfinder.resolveUrl(config)
      return decodeURIComponent(resolvedUrl.toString()) as Entities.GatewayUrl
    })
  }

  async dissolve(url: Entities.GatewayUrl | URL) {
    return Utils.tryCatch(async () => {
      const wayfinderUrl = new URL(url)
      wayfinderUrl.hostname = wayfinderUrl.hostname.split(".").shift() as string
      return wayfinderUrl
        .toString()
        .replace("http:", "ar:")
        .replace("https:", "ar:") as Entities.WayfinderUrl
    })
  }
}
