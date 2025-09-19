export type Result<TData, TError extends { message: string } = Error> =
  | { ok: true; failed: false; data: TData }
  | { ok: false; failed: true; error: TError }

export type EmptyResult<E extends { message: string } = Error> = Result<void, E>

export type PromisedResult<TData, TError extends { message: string } = Error> = Promise<
  Result<TData, TError>
>

export type PromisedEmptyResult<E extends { message: string } = Error> = Promise<EmptyResult<E>>

export function empty(): EmptyResult {
  return { ok: true, failed: false, data: void 0 }
}

export function ok<TData>(data: TData): Result<TData> {
  return { ok: true, failed: false, data }
}

export function error<TError extends { message: string } = Error>(
  error: TError,
): Result<never, TError> {
  return { ok: false, failed: true, error }
}

export async function tryCatch<TData, TError extends { message: string } = Error>(
  f: () => PromisedResult<TData, TError> | Result<TData, TError> | Promise<TData> | TData,
) {
  let result: Result<TData, TError> | Awaited<TData>
  try {
    result = await f()
  } catch (e: any) {
    return error(e as TError)
  }

  if (typeof result === "object" && result !== null && "ok" in result) return result

  return ok(result)
}

import pino from "pino"

const logger = pino({
  level: "info",
  formatters: {
    level(label: string) {
      return { level: label }
    },
    
    log(obj: any) {
      if (Array.isArray(obj.msg)) {
        obj.msg = obj.msg[0]
          .split("\n")
          .map((line: string) => {
            if (line.includes("node_modules")) return null
            if (line.includes("node:")) return null

            return line.trim().replace(/^at /, "")
          })
          .filter(Boolean)
          .join("\n")
      }

      return obj
    },
  },
})

export function setLogLevel(level: "debug" | "info" | "warn" | "error") {
  logger.level = level
}

export function getLogger(moduleName: string) {
  return logger.child({ module: moduleName })
}
