import { Dataset } from "crawlee"

import type * as StoragePort from "../ports/storage.js"

export class CrawleeDatasetStorageAdapter implements StoragePort.StorageOutput {
  async open(storageId: string): Promise<StoragePort.ResultStore> {
    const dataset = await Dataset.open(storageId)

    return {
      save: dataset.pushData.bind(dataset),
    } satisfies StoragePort.ResultStore
  }
}
