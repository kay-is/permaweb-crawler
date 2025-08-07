import type { TaskEntity } from "../../../crawler/modules/entities.js"

export interface ApiClientPort {
  createTask(taskConfig: Omit<TaskEntity, "id">): Promise<TaskEntity>
}
