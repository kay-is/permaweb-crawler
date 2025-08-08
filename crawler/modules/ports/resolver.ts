import type { ArnsName, GatewayUrl, WayfinderUrl } from "../entities.js"

export interface ResolverUtil {
  resolve(url: WayfinderUrl): Promise<GatewayUrl>
  resolve(arnsName: ArnsName): Promise<GatewayUrl>
  desolve(url: GatewayUrl | URL): Promise<WayfinderUrl>
}
