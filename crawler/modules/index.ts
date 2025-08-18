import CrawleePlaywrightCrawler from "./adapters/crawleePlaywrightCrawler.js"
import CrawleeNodeHtmlParserCrawler from "./adapters/crawleeNodeHtmlParserCrawler.js"
import NodeHtmlParserExtractor from "./adapters/nodeHtmlParserExtractor.js"
import TrpcApiServer from "./adapters/trpcApiServer.js"
import DuckdbPageDataStorage from "./adapters/duckdbPageDataStorage.js"
import SuperminhashMemoryPageDeduplicator from "./adapters/superminhashMemoryPageDeduplicator.js"
import NodeHttpWebServer from "./adapters/nodeHttpWebServer.js"
import CrawlingService from "./service.js"
import NetworkWayfinderArnsResolver from "./adapters/networkWayfinderArnsResolver.js"

await CrawlingService.start({
  adapters: {
    inputs: {
      apiServer: new TrpcApiServer(),
      crawlers: {
        browser: new CrawleePlaywrightCrawler(),
        html: new CrawleeNodeHtmlParserCrawler(),
      },
      arnsResolver: new NetworkWayfinderArnsResolver(),
    },
    utils: {
      pageDataExtractor: new NodeHtmlParserExtractor(),
      pageDeduplicator: new SuperminhashMemoryPageDeduplicator(),
    },
    outputs: {
      pageDataStorage: new DuckdbPageDataStorage(),
      webServer: new NodeHttpWebServer(),
    },
  },
})
