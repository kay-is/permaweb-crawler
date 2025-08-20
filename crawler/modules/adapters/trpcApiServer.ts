import * as TrpcServer from "@trpc/server"
import * as TrpcServerAdapter from "@trpc/server/adapters/standalone"

import * as Utils from "../utils.js"
import * as Entities from "../entities.js"
import type * as ApiServer from "../ports/apiServer.js"

export type AppRouter = TrpcApiServer["appRouter"]

export default class TrpcApiServer implements ApiServer.ApiServerInput {
  #log = Utils.getLogger("TrpcApiServer")

  #createTaskHandler?: ApiServer.CreateTaskHandler
  #listTasksHandler?: ApiServer.ListTasksHandler

  #trpc = TrpcServer.initTRPC.create()
  #appRouter = this.#trpc.router({
    createTask: this.#trpc.procedure
      .input(Entities.crawlTaskConfigSchema)
      .output(Entities.crawlTaskSchema)
      .mutation(({ input }) => {
        if (!this.#createTaskHandler) throw new Error("No createTaskHandler set!")
        return this.#createTaskHandler(input)
      }),
    listTasks: this.#trpc.procedure.output(Entities.crawlTaskListSchema).query(() => {
      if (!this.#listTasksHandler) throw new Error("No listTasksHandler set!")
      return this.#listTasksHandler()
    }),
  })

  // for type extraction
  get appRouter() {
    return this.#appRouter
  }

  async start(config: ApiServer.ApiServerConfig) {
    this.#log.debug({
      msg: "starting server",
      config: { ...config, handlers: Object.keys(config.handlers) },
    })

    this.#createTaskHandler = config.handlers.createTask
    this.#listTasksHandler = config.handlers.listTasks

    return Utils.tryCatch(async () =>
      TrpcServerAdapter.createHTTPHandler({
        router: this.#appRouter,
        onError: (opts) => {
          this.#log.error({ msg: opts.error.message, path: opts.path, input: opts.input })
        },
      }),
    )
  }
}
