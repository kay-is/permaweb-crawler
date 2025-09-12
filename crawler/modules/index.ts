import CrawleePlaywrightCrawler from "./adapters/crawleePlaywrightCrawler.js"
import CrawleeNodeHtmlParserCrawler from "./adapters/crawleeNodeHtmlParserCrawler.js"
import NodeHtmlParserExtractor from "./adapters/nodeHtmlParserExtractor.js"
import DuckdbPageDataStorage from "./adapters/duckdbPageDataStorage.js"
import SuperminhashMemoryPageDeduplicator from "./adapters/superminhashMemoryPageDeduplicator.js"
import CrawlingService from "./service.js"
import NetworkWayfinderArnsResolver from "./adapters/networkWayfinderArnsResolver.js"
import TurboSdkPageDataUploader from "./adapters/turboSdkPageDataUploader.js"
import HonoWebServer from "./adapters/honoWebServer.js"

await CrawlingService.start({
  adapters: {
    inputs: {
      webServer: new HonoWebServer(),
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
      pageDataUploader: new TurboSdkPageDataUploader(),
    },
  },
})
