import * as v from "valibot"

export const arweaveTxIdSchema = v.pipe(v.string(), v.length(43))
export type ArweaveTxId = v.InferInput<typeof arweaveTxIdSchema>

export const arnsNameSchema = v.pipe(v.string(), v.trim(), v.regex(/^[a-zA-Z0-9_-]*$/))
export type ArnsName = v.InferInput<typeof arnsNameSchema>

export const wayfinderUrlSchema = v.pipe(v.string(), v.trim(), v.startsWith("ar://"))
export type WayfinderUrl = `ar://${string}`

export const gatewayUrlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^(https:\/\/)((?:[a-zA-Z0-9_-]+\.){2,}[a-zA-Z]{2,})($|[/?#].*)$/i),
)
export type GatewayUrl = `https://${string}.${string}`

export const crawlerTypesSchema = v.union([v.literal("browser") /* v.literal("html") */])
export type CrawlerTypes = v.InferInput<typeof crawlerTypesSchema>

export const crawlTaskSchema = v.object({
  // Task config options
  arnsNames: v.array(arnsNameSchema),
  executeJavaScript: v.boolean(),
  extractHashUrls: v.boolean(),
  similarityThreshold: v.number(),

  // Task state
  id: v.string(),
  pageCount: v.number(),
  duplicateCount: v.number(),
  error: v.optional(v.string()),
  createdAt: v.number(),
  finishedAt: v.optional(v.number()),
})
export type CrawlTask = v.InferInput<typeof crawlTaskSchema>

export const crawlTaskConfigSchema = v.omit(crawlTaskSchema, [
  "id",
  "pageCount",
  "createdAt",
  "finishedAt",
  "duplicateCount",
  "error",
])
export type CrawlTaskConfig = v.InferInput<typeof crawlTaskConfigSchema>

export const htmlDataSchema = v.object({
  charset: v.string(),
  language: v.string(),
  title: v.string(),
  description: v.string(),
  openGraph: v.array(
    v.object({
      property: v.string(),
      content: v.string(),
    }),
  ),
  normalizedHtml: v.string(),
})

export type HtmlData = v.InferInput<typeof htmlDataSchema>

export const pageDataSchema = v.object({
  ...htmlDataSchema.entries,
  txId: arweaveTxIdSchema,
  arnsName: arnsNameSchema,
  wayfinderUrl: wayfinderUrlSchema,
  gatewayUrl: gatewayUrlSchema,
  headers: v.array(
    v.object({
      name: v.string(),
      value: v.string(),
    }),
  ),
  relativeUrls: v.array(v.string()),
  absoluteUrls: v.array(v.string()),
})

export type PageData = v.InferInput<typeof pageDataSchema>
