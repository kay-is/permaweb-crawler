import fs from "node:fs"
import path from "node:path"
import * as v from "valibot"

import type { StoragePort } from "../ports/storage.js"
import { taskEntitySchema, type TaskConfigEntity } from "../../../crawler/modules/entities.js"

export class TaskConfigStorageAdapter implements StoragePort<TaskConfigEntity> {
  #basePath: string

  constructor(storageId: string) {
    this.#basePath = path.resolve(storageId)
  }

  async load(key: string): Promise<TaskConfigEntity> {
    const taskConfig = JSON.parse(
      fs.readFileSync(path.join(this.#basePath, `task.${key}.json`), { encoding: "utf-8" })
    )

    return v.parse(v.omit(taskEntitySchema, ["id"]), taskConfig)
  }
}
