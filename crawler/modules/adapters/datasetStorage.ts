import { Dataset } from "crawlee"
import type { Storage, StoragePort } from "../ports/storage.js"

export class DatasetStorageAdapter implements StoragePort {
  async open(storageId: string): Promise<Storage> {
    const dataset = await Dataset.open(storageId)

    return {
      save: async (data) => {
        await dataset.pushData(data)
      },
    } satisfies Storage
  }
}
