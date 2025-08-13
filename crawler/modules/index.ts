import CrawleePlaywrightCrawler from "./adapters/crawleePlaywrightCrawler.js"
import NodeHtmlParserExtractor from "./adapters/nodeHtmlParserExtractor.js"
import TrpcApiServer from "./adapters/trpcApiServer.js"
import StaticWayfinderArnsResolver from "./adapters/staticWayfinderArnsResolver.js"
import DuckdbPageDataStorage from "./adapters/duckdbPageDataStorage.js"
import NodeHttpWebServer from "./adapters/nodeHttpWebServer.js"
import CrawlingService from "./service.js"

await CrawlingService.start({
  adapters: {
    inputs: {
      apiServer: new TrpcApiServer(),
      crawlers: {
        browser: new CrawleePlaywrightCrawler(),
      },
      arnsResolver: new StaticWayfinderArnsResolver({
        gatewayUrls: [
          "https://ar-io-gateway.svc.blacksand.xyz",
          "https://permagate.io",
          "https://ario.ionode.top",
          "https://zigza.xyz",
        ],
      }),
    },
    utils: {
      pageDataExtractor: new NodeHtmlParserExtractor(),
    },
    outputs: {
      resultStorage: new DuckdbPageDataStorage(),
      webServer: new NodeHttpWebServer(),
    },
  },
})
