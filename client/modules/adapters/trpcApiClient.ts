import { createTRPCClient, httpBatchLink } from "@trpc/client"

import type { ApiClientPort } from "../ports/apiClient.js"
import type { TaskEntity } from "../../../crawler/modules/entities.js"
import type { TrpcAdapter } from "../../../crawler/modules/adapters/trpcApi.js"

export class TrpcApiClientAdapter implements ApiClientPort {
  #client: ReturnType<typeof createTRPCClient<TrpcAdapter["appRouter"]>>

  constructor(serverUrl: string) {
    this.#client = createTRPCClient<TrpcAdapter["appRouter"]>({
      links: [httpBatchLink({ url: serverUrl })],
    })
  }

  async createTask(taskConfig: Omit<TaskEntity, "id">): Promise<TaskEntity> {
    return this.#client.createTask.mutate(taskConfig)
  }
}
