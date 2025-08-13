import * as Entities from "../entities.js"

export interface ArnsResolverInput {
  resolve(arnsName: Entities.ArnsName): Promise<Entities.GatewayUrl>
  resolve(url: Entities.WayfinderUrl): Promise<Entities.GatewayUrl>
  dissolve(url: Entities.GatewayUrl | URL): Promise<Entities.WayfinderUrl>
}
