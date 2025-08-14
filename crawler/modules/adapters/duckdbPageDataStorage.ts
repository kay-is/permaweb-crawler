import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import * as Duckdb from "@duckdb/node-api"

import * as Utils from "../utils.js"
import * as Entities from "../entities.js"
import * as PageDataStorage from "../ports/pageDataStorage.js"

const STORAGE_PATH = path.resolve("storage")
const DATABASE_PATH = path.join(STORAGE_PATH, "duckdb")
const EXPORTS_PATH = path.join(STORAGE_PATH, "exports")

const nullOrMap = <Item>(
  iterable: Item[],
  mapper: (item: Item) => { key: string; value: string },
) => (iterable.length < 1 ? null : Duckdb.mapValue(iterable.map(mapper)))

const nullOrList = (iterable: string[]) => (iterable.length < 1 ? null : Duckdb.listValue(iterable))

export default class DuckdbPageDataStorage implements PageDataStorage.PageDataStorageOutput {
  async open(storageId: string) {
    return Utils.tryCatch(async () => {
      await fs.mkdir(DATABASE_PATH, { recursive: true })

      const dbPath = path.join(DATABASE_PATH, `${storageId}.duckdb`)

      console.info({
        time: new Date(),
        level: "info",
        source: "DuckdbPageDataStorage",
        message: "opening storage",
        context: {
          storageId,
          databasePath: dbPath,
        },
      })

      const duckdbInstance = await Duckdb.DuckDBInstance.create(dbPath)
      const duckdb = await duckdbInstance.connect()

      const detailsTableName = "details"
      const htmlTableName = "html"

      await duckdb.run(`
        CREATE TABLE IF NOT EXISTS ${detailsTableName} (
          htmlHash VARCHAR PRIMARY KEY,
          
          txId VARCHAR NOT NULL,
          arnsName VARCHAR NOT NULL,
          wayfinderUrl VARCHAR NOT NULL,
          gatewayUrl VARCHAR NOT NULL,
          charset VARCHAR NOT NULL,
          language VARCHAR,
          title VARCHAR NOT NULL,
          description VARCHAR,
          
          headers MAP(VARCHAR, VARCHAR),
          absoluteUrls VARCHAR[],
          relativeUrls VARCHAR[],
          openGraph MAP(VARCHAR, VARCHAR),
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ${htmlTableName} (
          htmlHash VARCHAR PRIMARY KEY,
          normalizedHtml VARCHAR NOT NULL,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `)

      return {
        save: (data: Entities.PageData) =>
          Utils.tryCatch(async () => {
            const htmlHash = crypto.createHash("sha256").update(data.normalizedHtml).digest("hex")

            await duckdb.run(
              `
            INSERT INTO ${detailsTableName}
            (arnsName, wayfinderUrl, gatewayUrl, txId, charset, language, title, description, 
            headers, absoluteUrls, relativeUrls, openGraph, htmlHash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
              [
                data.arnsName,
                data.wayfinderUrl,
                data.gatewayUrl,
                data.txId,
                data.charset,
                data.language,
                data.title,
                data.description,
                nullOrMap(data.headers, ({ name, value }) => ({ key: name, value })),
                nullOrList(data.absoluteUrls),
                nullOrList(data.relativeUrls),
                nullOrMap(data.openGraph, ({ property, content }) => ({
                  key: property,
                  value: content,
                })),
                htmlHash,
              ],
            )

            await duckdb.run(
              `
            INSERT INTO ${htmlTableName}
            (htmlHash, normalizedHtml)
            VALUES (?, ?)
            `,
              [htmlHash, data.normalizedHtml],
            )
          }),
        export: () =>
          Utils.tryCatch(async () => {
            await fs.mkdir(EXPORTS_PATH, { recursive: true })

            await duckdb.run(`
              COPY ${detailsTableName}
              TO '${path.join(EXPORTS_PATH, `${storageId}-details.parquet`)}' (FORMAT PARQUET, COMPRESSION ZSTD, COMPRESSION_LEVEL 10);
              
              COPY ${htmlTableName} 
              TO '${path.join(EXPORTS_PATH, `${storageId}-html.parquet`)}' (FORMAT PARQUET, COMPRESSION ZSTD, COMPRESSION_LEVEL 10);
            `)
          }),
        close: () =>
          Utils.tryCatch(async () => {
            duckdb.closeSync()
          }),
      }
    })
  }
}
