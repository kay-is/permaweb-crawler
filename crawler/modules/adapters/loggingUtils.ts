/**
 * Common logging utilities for consistent log formatting
 */

export interface LogContext {
  [key: string]: any
}

export interface LogMessage {
  source: string
  message: string
  context?: LogContext
}

/**
 * Standardized info logging
 */
export function logInfo(message: LogMessage): void {
  console.info(message)
}

/**
 * Standardized error logging
 */
export function logError(message: LogMessage): void {
  console.error(message)
}

/**
 * Standardized warning logging
 */
export function logWarn(message: LogMessage): void {
  console.warn(message)
}

/**
 * Creates a crawler starting log message
 */
export function createCrawlerStartLog(crawlerName: string, config: any): LogMessage {
  return {
    source: crawlerName,
    message: "starting",
    context: config,
  }
}

/**
 * Creates a page stored log message
 */
export function createPageStoredLog(taskId: string, wayfinderUrl: string, pageNumber: number): LogMessage {
  return {
    source: "PageDataStorage",
    message: "page stored",
    context: {
      taskId,
      wayfinderUrl,
      pageNumber,
    },
  }
}

/**
 * Creates a duplicate found log message
 */
export function createDuplicateFoundLog(
  taskId: string, 
  wayfinderUrl: string, 
  duplicateCount: number, 
  similarity: number
): LogMessage {
  return {
    source: "PageDeduplicator",
    message: "duplicate found",
    context: {
      taskId,
      wayfinderUrl,
      duplicateCount,
      similarity,
    },
  }
}

/**
 * Creates an error log message for failed operations
 */
export function createErrorLog(source: string, error: Error, context?: LogContext): LogMessage {
  return {
    source,
    message: error.message,
    context,
  }
}

/**
 * Creates a service started log message
 */
export function createServiceStartedLog(urls: { apiServerUrl: string; webAppUrl: string; exportDataUrl: string }): LogMessage {
  return {
    source: "CrawlingService",
    message: "service started",
    context: urls,
  }
}

/**
 * Creates a task created log message
 */
export function createTaskCreatedLog(task: any): LogMessage {
  return {
    source: "ApiServer",
    message: "task created",
    context: task,
  }
}

/**
 * Creates a crawling completed log message
 */
export function createCrawlingCompletedLog(taskId: string, pageCount: number, duplicateCount: number): LogMessage {
  return {
    source: "Crawler",
    message: "crawling completed",
    context: {
      taskId,
      pageCount,
      duplicateCount,
    },
  }
}

/**
 * Creates a task completed log message
 */
export function createTaskCompletedLog(task: any): LogMessage {
  return {
    source: "CrawlingService",
    message: "task completed",
    context: task,
  }
}