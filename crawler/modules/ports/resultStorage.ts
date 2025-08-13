import type { PageData } from "../entities.js"

export interface ResultStore {
  save(data: PageData): Promise<boolean>
  export(): Promise<void>
  close(): Promise<void>
}

export interface ResultStorageOutput {
  open(storageId: string): Promise<ResultStore>
}
