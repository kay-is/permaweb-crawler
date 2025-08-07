import type { TaskEntity } from "../entities.js"

export type CreateTaskHandler = (taskDefinition: Omit<TaskEntity, "id">) => Promise<TaskEntity>

export interface ApiPort {
  start(): Promise<void>
  set createTaskHandler(callback: CreateTaskHandler)
}
