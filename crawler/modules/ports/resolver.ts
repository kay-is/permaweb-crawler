import type { ArnsName, GatewayUrl, WayfinderUrl } from "../entities.js"

export interface ResolverPort {
  resolve(url: WayfinderUrl): Promise<GatewayUrl>
  resolve(arnsName: ArnsName): Promise<GatewayUrl>
}
