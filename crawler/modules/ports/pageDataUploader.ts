import type * as Utils from "../utils.js"
import type * as Entities from "../entities.js"

export interface PageDataUploaderOutput {
  upload(taskId: string): Utils.PromisedResult<Entities.ArweaveTxId>
}
