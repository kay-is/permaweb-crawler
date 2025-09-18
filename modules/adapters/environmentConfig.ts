import path from "path"

import * as Config from "../ports/config.js"

export default class EnvironmentConfig implements Config.ConfigInput {
  logLevel: "debug" | "info" | "warn" | "error"
  port: number
  walletPath: string
  fallbackGateway: string
  maxTasks: number

  constructor(env: NodeJS.ProcessEnv) {
    this.logLevel = (env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "info"
    this.port = env.PORT ? parseInt(env.PORT) : 3000
    this.walletPath = path.resolve(env.WALLET_PATH || "./wallet.json")
    this.fallbackGateway = env.FALLBACK_GATEWAY || "ar.io"
    this.maxTasks = env.MAX_TASKS ? parseInt(env.MAX_TASKS) : 100
  }
}
