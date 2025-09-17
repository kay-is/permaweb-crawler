import type * as Utils from "../utils.js"
import type * as Entities from "../entities.js"

export interface PageDataUploaderConfig {
  walletPath: string
}

export interface PageDataUploaderOutput {
  start(config: PageDataUploaderConfig): Utils.PromisedResult<void>
  upload(taskId: string): Utils.PromisedResult<Entities.ArweaveTxId>
}
