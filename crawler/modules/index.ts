import { CrawleePlaywrightCrawlerAdapter } from "./adapters/crawleePlaywrightCrawler.js"
import { CrawleeDatasetStorageAdapter } from "./adapters/crawleeDatasetStorage.js"
import { NodeHtmlParserExtractorAdapter } from "./adapters/nodeHtmlParserExtractor.js"
import { TrpcApiAdapter } from "./adapters/trpcApi.js"
import { StaticWayfinderResolverAdapter } from "./adapters/staticWayfinderResolver.js"
import { CrawlingService } from "./service.js"

await CrawlingService.start({
  adapters: {
    inputs: {
      api: new TrpcApiAdapter({ port: 3000 }),
      crawlers: {
        browser: new CrawleePlaywrightCrawlerAdapter(),
      },
    },
    utils: {
      extractor: new NodeHtmlParserExtractorAdapter(),
      resolver: new StaticWayfinderResolverAdapter({
        gatewayUrls: ["https://arweave.net", "https://permagate.io"],
      }),
    },
    outputs: {
      storage: new CrawleeDatasetStorageAdapter(),
    },
  },
})
