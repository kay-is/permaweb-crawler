import type { CrawlTaskConfig, CrawlTask } from "../entities.js"

export type CreateTaskHandler = (taskDefinition: CrawlTaskConfig) => Promise<CrawlTask>

export type ApiHandlers = {
  createTask: CreateTaskHandler
}

export interface ApiInput {
  start(handlers: ApiHandlers): Promise<void>
}
