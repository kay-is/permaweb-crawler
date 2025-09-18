import type { PromisedResult } from "../utils.js"

export interface PageDuplicateStore {
  check: (data: string) => PromisedResult<{ isDuplicate: boolean; similarity: number }>
}

export interface PageDeduplicatorUtil {
  open: (storageId: string, similarityThreshold: number) => PromisedResult<PageDuplicateStore>
}
