import http from "node:http"

import * as Utils from "../utils.js"

export interface WebServerConfig {
  port: number
  requestHandler: http.RequestListener
}

export interface WebServerOutput {
  start(config: WebServerConfig): Utils.PromisedEmptyResult
}
