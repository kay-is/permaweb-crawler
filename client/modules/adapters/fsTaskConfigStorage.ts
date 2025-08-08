import fs from "node:fs"
import path from "node:path"

import * as TaskStoragePort from "../ports/taskStorage.js"

export class FsTaskConfigStorageAdapter implements TaskStoragePort.TaskStorageInput {
  #basePath: string

  constructor(storageId: string) {
    this.#basePath = path.resolve(storageId)
  }

  async load(key: string) {
    const taskConfig = JSON.parse(
      fs.readFileSync(path.join(this.#basePath, `task.${key}.json`), { encoding: "utf-8" })
    )

    return TaskStoragePort.validateTaskConfig(taskConfig)
  }
}
