import http from "node:http"

import * as Utils from "../utils.js"
import * as WebServer from "../ports/webServer.js"

export default class NodeHttpWebServer extends Utils.WrappedAdapter implements WebServer.WebServerOutput {
  #log = Utils.getLogger("NodeHttpWebServer")

  async start(config: WebServer.WebServerConfig) {
    return this.wrap(() => {
      this.#log.debug({ msg: "starting web server", config })

      const server = http.createServer(config.requestHandler)

      return new Promise<void>((resolve, reject) => {
        server.on("listening", () => {
          Array("SIGINT", "SIGTERM").forEach((signal) => {
            process.on(signal, async () => {
              this.#log.debug({ msg: "received shutdown signal", signal })

              await new Promise((r) => server.close(r))

              this.#log.info({ msg: "shutdown complete", signal })
              process.exit(0)
            })
          })

          resolve()
        })

        try {
          server.listen(config.port)
        } catch (error: any) {
          reject(error)
        }
      })
    })
  }
}
