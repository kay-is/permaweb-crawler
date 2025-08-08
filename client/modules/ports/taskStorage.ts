import * as v from "valibot"

import * as Entities from "../../../crawler/external/entities.js"

export const validateTaskConfig = (taskConfig: unknown) =>
  v.parse(Entities.crawlTaskConfigSchema, taskConfig)

export interface TaskStorageInput {
  load(key: string): Promise<Entities.CrawlTaskConfig>
}
