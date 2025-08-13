import http from "node:http"

import type { WebServerConfig, WebServerOutput } from "../ports/webServer.js"

export class NodeHttpWebServerAdapter implements WebServerOutput {
  start(config: WebServerConfig): Promise<void> {
    const server = http.createServer(config.requestHandler)

    return new Promise<void>((resolve, reject) => {
      server.on("listening", () => {
        console.info(`[NodeHttpWebServer] Server running at http://localhost:${config.port}/`)
        resolve()
        ;["SIGINT", "SIGTERM"].forEach((signal) => {
          process.on(signal, async () => {
            console.log(`\nReceived ${signal}, shutting down...`)

            await new Promise((r) => server.close(r))

            console.log("Shutdown complete")
            process.exit(0)
          })
        })
      })
      try {
        server.listen(config.port)
      } catch (e) {
        reject(e)
      }
    })
  }
}
