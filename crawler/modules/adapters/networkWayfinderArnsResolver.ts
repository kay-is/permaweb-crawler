import * as ArioSdk from "@ar.io/sdk"
import * as WayfinderCore from "@ar.io/wayfinder-core"

import * as Utils from "../utils.js"
import type * as Entities from "../entities.js"
import type * as ArnsResolver from "../ports/arnsResolver.js"

export default class NetworkWayfinderArnsResolver implements ArnsResolver.ArnsResolverInput {
  #wayfinder: WayfinderCore.Wayfinder

  constructor() {
    console.info({
      time: new Date(),
      level: "info",
      source: "NetworkWayfinderArnsResolver",
      message: "initializing",
      context: {
        providers: ["SimpleCacheGatewaysProvider", "NetworkGatewaysProvider"],
        network: "mainnet",
      },
    })
    this.#wayfinder = new WayfinderCore.Wayfinder({
      gatewaysProvider: new WayfinderCore.SimpleCacheGatewaysProvider({
        gatewaysProvider: new WayfinderCore.NetworkGatewaysProvider({
          ario: ArioSdk.ARIO.mainnet(),
          blocklist: [
            "https://kabaoglu.store",
            "https://go2.fullnode.agency",
            "https://arlink.xyz",
            "https://sevgi.online",
            "https://tersiyer.store",
            "https://enyaselessar.xyz",
            "https://gurase.uno",
            "https://cmdexe1.xyz",
            "https://ario4.aoar.io.vn",
            "https://4u.fullnode.agency",
            "https://kgenesys.store",
            "https://ar3.stilucky.xyz",
            "https://vela-gateway.com",
            "https://ioar.net",
            "https://nuisong.store",
            "https://ario.node.axshelf.com",
            "https://testnetnodes.xyz",
            "https://gurase.uno",
            "https://aslanas01.xyz",
            "https://kingsharaldoperator.xyz",
            "https://petalgear.online",
            "https://tersiyer.store",
            "https://sevgi.online",
            "https://upin3.fullnode.agency",
            "https://stilucky.top",
            "https://ar.4everland.io",
            "https://reetas.xyz",
            "https://leechshop.com",
            "https://enyaselessar.xyz",
            "https://vn-sti.top",
            "https://hatoxt.shop",
            "https://hexamz.site",
            "https://4.st3.ario.p10node.onl",
          ],
        }),
        logger: {
          ...console,
          debug: () => null,
          info: () => null,
        },
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
