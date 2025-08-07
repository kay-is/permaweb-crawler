import type { ApiClientPort } from "./ports/apiClient.js"
import type { StoragePort } from "./ports/storage.js"
import type { TaskConfigEntity } from "../../crawler/modules/entities.js"

export interface ClientServiceAdapters {
  taskConfigStore: StoragePort<TaskConfigEntity>
  apiClient: ApiClientPort
}

export class ClientService {
  #taskConfigStore: StoragePort<TaskConfigEntity>
  #apiClient: ApiClientPort

  static async start(adapters: ClientServiceAdapters) {
    const client = new ClientService(adapters)
    return await client.start()
  }

  constructor(adapters: ClientServiceAdapters) {
    this.#taskConfigStore = adapters.taskConfigStore
    this.#apiClient = adapters.apiClient
  }

  async start() {
    const taskConfig = await this.#taskConfigStore.load("docs")
    return this.#apiClient.createTask(taskConfig)
  }
}
