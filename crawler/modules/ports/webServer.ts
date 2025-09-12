import * as Entities from "../entities.js"
import * as Utils from "../utils.js"

export interface WebServerConfig {
  port: number
  handlers: {
    createTask: (taskConfig: Entities.CrawlTaskConfig) => Promise<Entities.CrawlTask>
    listTasks: () => Promise<Entities.CrawlTaskList>
  }
}

export interface WebServerInput {
  start(config: WebServerConfig): Utils.PromisedEmptyResult
}
