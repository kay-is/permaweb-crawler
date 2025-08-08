import type { PageData } from "../entities.js"

export interface ResultStore {
  save(data: PageData): Promise<void>
}

export interface StorageOutput {
  open(storageId: string): Promise<ResultStore>
}
