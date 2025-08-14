import * as TrpcServer from "@trpc/server"
import * as TrpcServerAdapter from "@trpc/server/adapters/standalone"

import * as Utils from "../utils.js"
import * as Entities from "../entities.js"
import type * as ApiServer from "../ports/apiServer.js"

export type AppRouter = TrpcApiServer["appRouter"]

export default class TrpcApiServer implements ApiServer.ApiServerInput {
  #createTaskHandler?: ApiServer.CreateTaskHandler

  #trpc = TrpcServer.initTRPC.create()
  #appRouter = this.#trpc.router({
    createTask: this.#trpc.procedure
      .input(Entities.crawlTaskConfigSchema)
      .output(Entities.crawlTaskSchema)
      .mutation(({ input }) => {
        if (!this.#createTaskHandler) throw new Error("No createTaskHandler set!")
        return this.#createTaskHandler(input)
      }),
  })

  // for type extraction
  get appRouter() {
    return this.#appRouter
  }

  async start(config: ApiServer.ApiServerConfig) {
    console.info({
      time: new Date(),
      level: "info",
      source: "TrpcApiServer",
      message: "starting",
      context: config,
    })

    this.#createTaskHandler = config.handlers.createTask

    return Utils.tryCatch(async () =>
      TrpcServerAdapter.createHTTPHandler({ router: this.#appRouter }),
    )
  }
}
