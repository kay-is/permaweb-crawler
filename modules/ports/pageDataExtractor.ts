import type * as Utils from "../utils.js"
import type * as Entities from "../entities.js"

export interface PageDataExtractorUtil {
  extract(html: string): Utils.PromisedResult<Entities.HtmlData>
}
