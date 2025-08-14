import { FsTaskConfigStorageAdapter } from "./adapters/fsTaskConfigStorage.js"
import { TrpcWorkerClientAdapter } from "./adapters/trpcWorkerClient.js"
import { ClientService } from "./clientService.js"

const taskName = process.argv[2] || "docs"

console.info("Starting client...")
const taskId = await ClientService.start({
  taskId: taskName,
  adapters: {
    inputs: {
      taskConfigStore: new FsTaskConfigStorageAdapter("fixtures"),
    },
    outputs: {
      workerClient: new TrpcWorkerClientAdapter("http://localhost:3000"),
    },
  },
})
console.log("Received Task ID:", taskId)
