import type { HtmlData } from "../entities.js"

export interface PageDataExtractorUtil {
  extract(html: string): Promise<HtmlData>
}
