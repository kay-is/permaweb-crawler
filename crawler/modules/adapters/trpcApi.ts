import * as TrpcServer from "@trpc/server"
import * as TrpcServreAdaptreStandalone from "@trpc/server/adapters/standalone"

import * as Entities from "../entities.js"
import type * as ApiPort from "../ports/api.js"

export type AppRouter = TrpcApiAdapter["appRouter"]

export type TrpcApiAdapterConfig = {
  port: number
}

export class TrpcApiAdapter implements ApiPort.ApiInput {
  #port: number
  #createTaskHandler?: ApiPort.CreateTaskHandler

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

  constructor(config: TrpcApiAdapterConfig) {
    this.#port = config.port
  }

  async start(handlers: ApiPort.ApiHandlers) {
    this.#createTaskHandler = handlers.createTask

    const server = TrpcServreAdaptreStandalone.createHTTPServer({ router: this.#appRouter })

    return new Promise<void>((resolve, reject) => {
      server.on("listening", () => {
        resolve()
      })
      try {
        server.listen(this.#port)
      } catch (e) {
        reject(e)
      }
    })
  }
}
