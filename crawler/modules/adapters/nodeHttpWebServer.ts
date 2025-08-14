import http from "node:http"

import * as Utils from "../utils.js"
import * as WebServer from "../ports/webServer.js"

export default class NodeHttpWebServer implements WebServer.WebServerOutput {
  async start(config: WebServer.WebServerConfig) {
    return Utils.tryCatch(async () => {
      console.info({
        time: new Date(),
        level: "info",
        source: "NodeHttpWebServer",
        message: "starting",
        context: config,
      })

      const server = http.createServer(config.requestHandler)

      return new Promise<Utils.EmptyResult>((resolve, reject) => {
        server.on("listening", () => {
          Array("SIGINT", "SIGTERM").forEach((signal) => {
            process.on(signal, async () => {
              console.info({
                time: new Date(),
                level: "info",
                source: "NodeHttpWebServer",
                message: "Shutting down",
                context: {
                  signal,
                },
              })

              await new Promise((r) => server.close(r))

              console.info({
                time: new Date(),
                level: "info",
                source: "NodeHttpWebServer",
                message: "Shutdown complete",
                context: {
                  signal,
                },
              })
              process.exit(0)
            })
          })

          resolve(Utils.empty())
        })

        try {
          server.listen(config.port)
        } catch (error: any) {
          reject(Utils.error(error))
        }
      })
    })
  }
}
