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

/**
 * Automatically wraps all methods of an adapter class with tryCatch functionality.
 * This eliminates the need to manually call Utils.tryCatch in each adapter method.
 * 
 * @param adapter The adapter instance to wrap
 * @returns A new adapter instance with all methods automatically wrapped
 */
export function wrapAdapter<T extends object>(adapter: T): T {
  // Create a new object that will hold the wrapped methods
  const wrappedAdapter = Object.create(Object.getPrototypeOf(adapter))
  
  // Copy all properties from the original adapter
  Object.getOwnPropertyNames(adapter).forEach(key => {
    wrappedAdapter[key] = (adapter as any)[key]
  })

  // Get all method names from the prototype chain
  const methodNames = new Set<string>()
  let current = adapter
  while (current && current !== Object.prototype) {
    Object.getOwnPropertyNames(current).forEach(name => {
      if (name !== 'constructor' && typeof (current as any)[name] === 'function') {
        methodNames.add(name)
      }
    })
    current = Object.getPrototypeOf(current)
  }

  // Wrap each method
  methodNames.forEach(methodName => {
    const originalMethod = (adapter as any)[methodName]
    if (typeof originalMethod === 'function') {
      wrappedAdapter[methodName] = async function(...args: any[]) {
        try {
          const result = await originalMethod.apply(adapter, args)
          
          // If the result is already a Result object, return it as-is
          if (typeof result === "object" && result !== null && "ok" in result) {
            return result
          }
          
          // Otherwise, wrap the result in an ok() Result
          return ok(result)
        } catch (e: any) {
          return error(e)
        }
      }
    }
  })

  return wrappedAdapter as T
}

/**
 * A simpler approach: Create a base class that adapters can extend to get automatic wrapping
 */
export abstract class WrappedAdapter {
  /**
   * Wraps a method implementation with automatic error handling
   */
  protected async wrap<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
    try {
      const result = await fn()
      return ok(result)
    } catch (e: any) {
      return error(e)
    }
  }
}

import pino from "pino"

const logger = pino({
  level: "debug",
  formatters: {
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

export function getLogger(moduleName: string) {
  return logger.child({ module: moduleName })
}
