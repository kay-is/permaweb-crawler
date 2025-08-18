import http from "node:http"

import * as Utils from "../utils.js"
import * as Entities from "../entities.js"

export type CreateTaskHandler = (
  taskDefinition: Entities.CrawlTaskConfig,
) => Promise<Entities.CrawlTask>

export type ListTasksHandler = () => Promise<Entities.CrawlTask[]>

export type ApiServerConfig = {
  handlers: {
    createTask: CreateTaskHandler
    listTasks: ListTasksHandler
  }
}

export type ApiServerHandler = http.RequestListener

export interface ApiServerInput {
  start(handlers: ApiServerConfig): Promise<Utils.Result<ApiServerHandler>>
}
