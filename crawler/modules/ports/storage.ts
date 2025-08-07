import type { ScrapingDataEntity } from "../entities.js"

export interface Storage {
  save(data: ScrapingDataEntity): Promise<void>
}

export interface StoragePort {
  open(storageId: string): Promise<Storage>
}
