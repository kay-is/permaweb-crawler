import { StaticGatewaysProvider, Wayfinder } from "@ar.io/wayfinder-core"

import type { ArnsName, GatewayUrl, WayfinderUrl } from "../entities.js"
import type { ResolverPort } from "../ports/resolver.js"

export class WayfinderResolverAdapter implements ResolverPort {
  #wayfinder = new Wayfinder({
    gatewaysProvider: new StaticGatewaysProvider({
      gateways: ["https://arweave.net", "https://permagate.io"],
    }),
  })

  async resolve(arnsName: string): Promise<GatewayUrl>
  async resolve(url: WayfinderUrl): Promise<GatewayUrl>

  async resolve(url: WayfinderUrl | ArnsName): Promise<GatewayUrl> {
    const config = url.startsWith("ar://")
      ? { wayfinderUrl: url as WayfinderUrl }
      : { arnsName: url }

    const resolvedUrl = await this.#wayfinder.resolveUrl(config)
    return resolvedUrl.toString() as GatewayUrl
  }
}
