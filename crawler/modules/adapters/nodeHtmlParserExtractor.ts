import * as NodeHtmlParser from "node-html-parser"

import * as Utils from "../utils.js"
import type * as PageDataExtractor from "../ports/pageDataExtractor.js"

export default class NodeHtmlParserExtractor implements PageDataExtractor.PageDataExtractorUtil {
  async extract(html: string) {
    return Utils.tryCatch(() => {
      const document = NodeHtmlParser.parse(html)

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
        document.querySelector("meta[name=description]")?.getAttribute("content") ?? ""
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

      openGraph.sort((a, b) =>
        a.property.localeCompare(b.property, undefined, { numeric: true, sensitivity: "base" }),
      )

      return {
        charset: charset.trim().toLowerCase(),
        language: language.trim().toLowerCase(),
        title: title.trim(),
        description,
        openGraph: openGraph.map((tag) => ({
          property: tag.property.trim().toLowerCase(),
          content: tag.content.trim(),
        })),
        normalizedHtml: normalizedHtml,
      }
    })
  }
}
