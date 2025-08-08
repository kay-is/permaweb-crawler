import * as TrpcClient from "@trpc/client"

import * as WorkerClientPort from "../ports/workerClient.js"
import * as TrpcApiAdapter from "../../../crawler/external/trpcApi.js"

export type TaskConfig = Parameters<WorkerClientPort.WorkerClientOutput["createTask"]>[0]
export type TaskPromise = ReturnType<WorkerClientPort.WorkerClientOutput["createTask"]>

export class TrpcWorkerClientAdapter implements WorkerClientPort.WorkerClientOutput {
  #client: ReturnType<typeof TrpcClient.createTRPCClient<TrpcApiAdapter.AppRouter>>

  constructor(serverUrl: string) {
    this.#client = TrpcClient.createTRPCClient<TrpcApiAdapter.AppRouter>({
      links: [TrpcClient.httpBatchLink({ url: serverUrl })],
    })
  }

  async createTask(taskConfig: TaskConfig): TaskPromise {
    return this.#client.createTask.mutate(taskConfig)
  }
}
