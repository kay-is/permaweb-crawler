import * as ArioSdk from "@ar.io/sdk"
import * as WayfinderCore from "@ar.io/wayfinder-core"

import * as Utils from "../utils.js"
import type * as Entities from "../entities.js"
import type * as ArnsResolver from "../ports/arnsResolver.js"

export default class NetworkWayfinderArnsResolver extends Utils.WrappedAdapter implements ArnsResolver.ArnsResolverInput {
  #log = Utils.getLogger("NetworkWayfinderArnsResolver")

  #wayfinder: WayfinderCore.Wayfinder

  constructor() {
    super()
    this.#log.debug({
      msg: "initializing resolver",
      network: "mainnet",
      providers: ["SimpleCacheGatewaysProvider", "NetworkGatewaysProvider"],
    })
    this.#wayfinder = new WayfinderCore.Wayfinder({
      logger: Utils.getLogger("WayfinderCore.Wayfinder"),
      gatewaysProvider: new WayfinderCore.SimpleCacheGatewaysProvider({
        logger: Utils.getLogger("WayfinderCore.SimpleCacheGatewaysProvider"),
        gatewaysProvider: new WayfinderCore.NetworkGatewaysProvider({
          logger: Utils.getLogger("WayfinderCore.NetworkGatewaysProvider"),
          ario: ArioSdk.ARIO.mainnet(),
        }),
      }),
    })
  }

  async resolve(urlOrArnsName: Entities.WayfinderUrl | Entities.ArnsName) {
    return this.wrap(async () => {
      const config = urlOrArnsName.startsWith("ar://")
        ? { wayfinderUrl: urlOrArnsName as Entities.WayfinderUrl }
        : { arnsName: urlOrArnsName }

      const resolvedUrl = await this.#wayfinder.resolveUrl(config)
      return decodeURIComponent(resolvedUrl.toString()) as Entities.GatewayUrl
    })
  }

  async dissolve(url: Entities.GatewayUrl | URL) {
    return this.wrap(async () => {
      const wayfinderUrl = new URL(url)
      wayfinderUrl.hostname = wayfinderUrl.hostname.split(".").shift() as string
      return wayfinderUrl
        .toString()
        .replace("http:", "ar:")
        .replace("https:", "ar:") as Entities.WayfinderUrl
    })
  }
}
