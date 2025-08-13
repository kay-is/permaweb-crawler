import * as WayfinderCore from "@ar.io/wayfinder-core"

import type * as Entities from "../entities.js"
import type * as ArnsResolverPort from "../ports/arnsResolver.js"

export type StaticWayfinderArnsResolverAdapterConfig = {
  gatewayUrls: `https://${string}`[]
}

export class StaticWayfinderArnsResolverAdapter implements ArnsResolverPort.ArnsResolverInput {
  #wayfinder: WayfinderCore.Wayfinder

  constructor(config: StaticWayfinderArnsResolverAdapterConfig) {
    this.#wayfinder = new WayfinderCore.Wayfinder({
      gatewaysProvider: new WayfinderCore.StaticGatewaysProvider({
        gateways: config.gatewayUrls,
      }),
    })
  }

  async resolve(arnsName: string): Promise<Entities.GatewayUrl>
  async resolve(url: Entities.WayfinderUrl): Promise<Entities.GatewayUrl>

  async resolve(url: Entities.WayfinderUrl | Entities.ArnsName): Promise<Entities.GatewayUrl> {
    const config = url.startsWith("ar://")
      ? { wayfinderUrl: url as Entities.WayfinderUrl }
      : { arnsName: url }

    const resolvedUrl = await this.#wayfinder.resolveUrl(config)
    return resolvedUrl.toString() as Entities.GatewayUrl
  }

  async dissolve(url: Entities.GatewayUrl | URL): Promise<Entities.WayfinderUrl> {
    const wayfinderUrl = new URL(url)
    wayfinderUrl.hostname = wayfinderUrl.hostname.split(".").shift() as string
    return wayfinderUrl
      .toString()
      .replace("http:", "ar:")
      .replace("https:", "ar:") as Entities.WayfinderUrl
  }
}
