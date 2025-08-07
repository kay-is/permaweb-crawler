import * as v from "valibot"
import { initTRPC } from "@trpc/server"
import { createHTTPServer } from "@trpc/server/adapters/standalone"

import type { ApiPort, CreateTaskHandler } from "../ports/api.js"
import { taskEntitySchema } from "../entities.js"

export class TrpcAdapter implements ApiPort {
  #trpc = initTRPC.create()

  appRouter = this.#trpc.router({
    createTask: this.#trpc.procedure
      .input(v.omit(taskEntitySchema, ["id"]))
      .output(taskEntitySchema)
      .mutation(({ input }) => {
        if (!this.#createTaskHandler) throw new Error("No createTaskHandler set!")
        return this.#createTaskHandler(input)
      }),
  })

  #createTaskHandler?: CreateTaskHandler
  set createTaskHandler(callback: CreateTaskHandler) {
    this.#createTaskHandler = callback
  }

  async start() {
    const server = createHTTPServer({ router: this.appRouter })

    return new Promise<void>((resolve, reject) => {
      server.on("listening", () => {
        resolve()
      })
      try {
        server.listen(3000)
      } catch (e) {
        reject(e)
      }
    })
  }
}
