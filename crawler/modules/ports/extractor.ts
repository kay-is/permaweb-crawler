import type { HtmlData } from "../entities.js"

export interface ExtractorUtil {
  extract(html: string): Promise<HtmlData>
}
