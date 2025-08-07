import * as v from "valibot"

export const arnsNameSchema = v.pipe(v.string(), v.trim(), v.regex(/^[a-zA-Z0-9_-]*$/))
export type ArnsName = v.InferInput<typeof arnsNameSchema>

export const wayfinderUrlSchema = v.pipe(v.string(), v.trim(), v.startsWith("ar://"))
export type WayfinderUrl = `ar://${string}`

export const gatewayUrlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^(https:\/\/)((?:[a-zA-Z0-9-]+\.){2,}[a-zA-Z]{2,})($|[/?#].*)$/i),
)
export type GatewayUrl = `https://${string}.${string}`

export const taskEntitySchema = v.object({
  id: v.string(),
  arnsNames: v.array(arnsNameSchema),
  executeJavaScript: v.boolean(),
  extractHashUrls: v.boolean(),
})
export type TaskEntity = v.InferInput<typeof taskEntitySchema>

export const taskConfigEntitySchema = v.omit(taskEntitySchema, ["id"])
export type TaskConfigEntity = v.InferInput<typeof taskConfigEntitySchema>

export const htmlDataEntitySchema = v.object({
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

export type HtmlDataEntity = v.InferInput<typeof htmlDataEntitySchema>

export const scrapingDataEntitySchema = v.object({
  ...htmlDataEntitySchema.entries,
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

export type ScrapingDataEntity = v.InferInput<typeof scrapingDataEntitySchema>
