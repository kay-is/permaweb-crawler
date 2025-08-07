import { TaskConfigStorageAdapter } from "./adapters/taskConfigStorage.js"
import { TrpcApiClientAdapter } from "./adapters/trpcApiClient.js"
import { ClientService } from "./clientService.js"

console.info("Starting client...")
const taskId = await ClientService.start({
  apiClient: new TrpcApiClientAdapter("http://localhost:3000"),
  taskConfigStore: new TaskConfigStorageAdapter("fixtures"),
})
console.log("Received Task ID:", taskId)
