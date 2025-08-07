import { BrowserCrawlerAdapter } from "./adapters/browserCrawler.js"
import { DatasetStorageAdapter } from "./adapters/datasetStorage.js"
import { NodeHtmlParserExtractorAdapter } from "./adapters/nodeHtmlParserExtractor.js"
import { TrpcAdapter } from "./adapters/trpcApi.js"
import { WayfinderResolverAdapter } from "./adapters/wayfinderResolver.js"
import { CrawlingService } from "./crawlerService.js"

await CrawlingService.start({
  api: new TrpcAdapter(),
  crawlers: {
    browser: new BrowserCrawlerAdapter(),
  },
  extractor: new NodeHtmlParserExtractorAdapter(),
  resolver: new WayfinderResolverAdapter(),
  storage: new DatasetStorageAdapter(),
})
