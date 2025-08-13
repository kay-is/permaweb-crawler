import type * as Utils from "../utils.js"
import type * as Entities from "../entities.js"

export interface PageDataStore {
  save(data: Entities.PageData): Utils.PromisedEmptyResult
  export(): Utils.PromisedEmptyResult
  close(): Utils.PromisedEmptyResult
}

export interface PageDataStorageOutput {
  open(storageId: string): Utils.PromisedResult<PageDataStore>
}
