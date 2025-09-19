import fs from "node:fs"
import path from "node:path"
import * as Hono from "hono"
import * as HonoLogger from "hono/logger"
import * as HonoError from "hono/http-exception"
import * as HonoServer from "@hono/node-server"
import * as HonoServerStatic from "@hono/node-server/serve-static"
import * as HonoValidator from "@hono/valibot-validator"

import * as Utils from "../utils.js"
import * as Entities from "../entities.js"
import * as WebServer from "../ports/webServer.js"

export default class HonoWebServer implements WebServer.WebServerInput {
  #log = Utils.getLogger("HonoWebServer")

  async start(config: WebServer.WebServerConfig) {
    return Utils.tryCatch(() => {
      const app = new Hono.Hono()

      this.#log.debug({ msg: "starting", config })

      app.use("*", async (context, next) => {
        try {
          await next()
        } catch (error) {
          this.#log.error({ msg: "middleware error", error })
          throw error
        }
      })

      app.onError((error, context) => {
        if (error instanceof HonoError.HTTPException) {
          this.#log.warn({ msg: error.message, path: context.req.path, error })
          return context.json({ error: error.message }, error.status)
        }

        if (error instanceof Error) {
          this.#log.error({ msg: error.message, path: context.req.path, error })
          return context.json({ error: error.message }, 500)
        }

        return context.json({ error: "unknown error occurred" }, 500)
      })

      app.use(
        HonoLogger.logger((message: string, ...rest: string[]) => {
          this.#log.info({ msg: message, ...rest })
        }),
      )

      app.use("/app/*", HonoServerStatic.serveStatic({ root: "public", index: "index.html" }))

      app.get("/exports", (context) => {
        const files = fs.readdirSync("storage/exports").map((file) => {
          return {
            name: file,
            url: `/exports/${file}`,
            size: fs.statSync(path.join("storage/exports", file)).size,
            time: fs.statSync(path.join("storage/exports", file)).mtime,
          }
        })
        return context.json({ files })
      })

      app.get("/tasks", async (context) => {
        const tasks = await config.handlers.listTasks()
        return context.json({ tasks })
      })

      app.post(
        "/tasks",
        HonoValidator.vValidator("json", Entities.crawlTaskConfigSchema),
        async (context) => {
          const taskConfig = await context.req.valid("json")
          const tasks = await config.handlers.createTask(taskConfig)
          return context.json({ tasks })
        },
      )

      const server = HonoServer.serve({ fetch: app.fetch, port: config.port })

      this.#log.debug({ msg: "started", config })

      process.on("SIGINT", () => {
        this.#log.info({ msg: "shutting down", signal: "SIGINT" })
        server.close()
        process.exit(0)
      })
      process.on("SIGTERM", () => {
        server.close((error) => {
          this.#log.info({ msg: "shutting down", signal: "SIGTERM" })
          if (error) {
            this.#log.error({ msg: "error during shutdown", error })
            process.exit(1)
          }
          process.exit(0)
        })
      })
    })
  }
}
