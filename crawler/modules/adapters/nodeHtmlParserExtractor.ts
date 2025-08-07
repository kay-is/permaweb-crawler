import parser from "node-html-parser"

import type { HtmlDataEntity } from "../entities.js"
import type { ExtractorPort } from "../ports/extractor.js"

export class NodeHtmlParserExtractorAdapter implements ExtractorPort {
  async extract(html: string): Promise<HtmlDataEntity> {
    const document = parser.parse(html)

    // Normalize HTML
    document.querySelectorAll("style").forEach((element) => element.remove())
    document.querySelectorAll("script").forEach((element) => element.remove())
    document.querySelectorAll("[style]").forEach((element) => element.removeAttribute("style"))
    document.querySelectorAll("[class]").forEach((element) => element.removeAttribute("class"))
    document.querySelectorAll("img").forEach((element) => {
      const srcUrl = element.getAttribute("src") ?? ""
      if (srcUrl.startsWith("data:")) element.removeAttribute("src")
    })
    document.querySelectorAll("svg").forEach((element) => (element.innerHTML = ""))
    const normalizedHtml = document.toString().replace(/>\s+</g, "><")

    // Extract content
    const title = document.querySelector("title")?.innerText ?? ""
    const description =
      document.querySelector("meta[name=description]")?.getAttribute("content")?.trim() ?? ""
    const charset = document.querySelector("meta[charset]")?.getAttribute("charset") ?? ""
    const language = document.querySelector("html")?.getAttribute("lang") ?? ""
    const openGraph = document
      .querySelectorAll("meta[property]")
      .filter((element) => element.getAttribute("property")?.startsWith("og:"))
      .map((tag) => {
        const property = tag.getAttribute("property")
        const content = tag.getAttribute("content")

        if (property && content) return { property, content }

        return null
      })
      .filter((tag) => !!tag)

    return {
      charset,
      language,
      title,
      description,
      openGraph,
      normalizedHtml,
    }
  }
}
