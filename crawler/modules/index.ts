import { CrawleePlaywrightCrawlerAdapter } from "./adapters/crawleePlaywrightCrawler.js"
import { NodeHtmlParserExtractorAdapter } from "./adapters/nodeHtmlParserExtractor.js"
import { TrpcApiServerAdapter } from "./adapters/trpcApiServer.js"
import { StaticWayfinderArnsResolverAdapter } from "./adapters/staticWayfinderResolver.js"
import { DuckdbStorageAdapter } from "./adapters/duckdbStorage.js"
import { NodeHttpWebServerAdapter } from "./adapters/nodeHttpWebServer.js"
import { CrawlingService } from "./service.js"

await CrawlingService.start({
  adapters: {
    inputs: {
      apiServer: new TrpcApiServerAdapter(),
      crawlers: {
        browser: new CrawleePlaywrightCrawlerAdapter(),
      },
      arnsResolver: new StaticWayfinderArnsResolverAdapter({
        gatewayUrls: [
          "https://ar-io-gateway.svc.blacksand.xyz",
          "https://permagate.io",
          "https://ario.ionode.top",
          "https://zigza.xyz",
        ],
      }),
    },
    utils: {
      pageDataExtractor: new NodeHtmlParserExtractorAdapter(),
    },
    outputs: {
      resultStorage: new DuckdbStorageAdapter(),
      webServer: new NodeHttpWebServerAdapter(),
    },
  },
})
