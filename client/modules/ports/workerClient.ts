import type { CrawlTaskConfig, CrawlTask } from "../../../crawler/external/entities.js"

export interface WorkerClientOutput {
  createTask(taskConfig: CrawlTaskConfig): Promise<CrawlTask>
}
