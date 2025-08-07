import type { HtmlDataEntity } from "../entities.js"

export interface ExtractorPort {
  extract(html: string): Promise<HtmlDataEntity>
}
