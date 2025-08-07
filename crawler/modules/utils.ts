import type { WayfinderUrl } from "./entities.js"

export const httpToWayfinder = (httpUrl: string | URL) => {
  const wayfinderUrl = new URL(httpUrl)
  wayfinderUrl.hostname = wayfinderUrl.hostname.split(".").shift() as string
  return wayfinderUrl.toString().replace("http:", "ar:").replace("https:", "ar:") as WayfinderUrl
}
