import * as WorkerClientPort from "./ports/workerClient.js"
import * as TaskStoragePort from "./ports/taskStorage.js"

export interface ClientServiceConfig {
  taskId: string
  adapters: {
    inputs: {
      taskConfigStore: TaskStoragePort.TaskStorageInput
    }
    outputs: {
      workerClient: WorkerClientPort.WorkerClientOutput
    }
  }
}

export class ClientService {
  #taskId: string
  #inputs: ClientServiceConfig["adapters"]["inputs"]
  #outputs: ClientServiceConfig["adapters"]["outputs"]

  static async start(config: ClientServiceConfig) {
    return new ClientService(config).start()
  }

  constructor(config: ClientServiceConfig) {
    this.#taskId = config.taskId
    this.#inputs = config.adapters.inputs
    this.#outputs = config.adapters.outputs
  }

  async start() {
    const taskConfig = await this.#inputs.taskConfigStore.load(this.#taskId)
    return this.#outputs.workerClient.createTask(taskConfig)
  }
}
