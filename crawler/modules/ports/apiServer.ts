import type { RequestListener } from "node:http"
import type { CrawlTaskConfig, CrawlTask } from "../entities.js"

export type CreateTaskHandler = (taskDefinition: CrawlTaskConfig) => Promise<CrawlTask>

export type ApiServerConfig = {
  handlers: {
    createTask: CreateTaskHandler
  }
}

export type ApiServerHandler = RequestListener

export interface ApiServerInput {
  start(handlers: ApiServerConfig): Promise<ApiServerHandler>
}
