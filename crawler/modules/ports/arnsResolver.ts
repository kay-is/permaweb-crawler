import * as Utils from "../utils.js"
import * as Entities from "../entities.js"

export interface ArnsResolverInput {
  resolve(
    urlOrArnsName: Entities.WayfinderUrl | Entities.ArnsName,
  ): Utils.PromisedResult<Entities.GatewayUrl>
  dissolve(url: Entities.GatewayUrl | URL): Utils.PromisedResult<Entities.WayfinderUrl>
}
