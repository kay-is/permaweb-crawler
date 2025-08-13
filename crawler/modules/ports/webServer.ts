import http from "node:http"

export interface WebServerConfig {
  port: number
  requestHandler: http.RequestListener
}

export interface WebServerOutput {
  start(config: WebServerConfig): Promise<void>
}
