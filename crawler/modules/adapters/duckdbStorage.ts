import fs from "node:fs/promises"
import path from "node:path"
import * as Duckdb from "@duckdb/node-api"

import * as Utils from "../utils.js"
import * as Entities from "../entities.js"
import * as ResultStoragePort from "../ports/pageDataStorage.js"

const STORAGE_PATH = path.resolve("storage")
const DATABASE_PATH = path.join(STORAGE_PATH, "duckdb")
const EXPORTS_PATH = path.join(STORAGE_PATH, "exports")

const nullOrMap = <Item>(
  iterable: Item[],
  mapper: (item: Item) => { key: string; value: string },
) => (iterable.length < 1 ? null : Duckdb.mapValue(iterable.map(mapper)))

const nullOrList = (iterable: string[]) => (iterable.length < 1 ? null : Duckdb.listValue(iterable))

export class DuckdbStorageAdapter implements ResultStoragePort.PageDataStorageOutput {
  async open(storageId: string) {
    return Utils.tryCatch(async () => {
      await fs.mkdir(DATABASE_PATH, { recursive: true })

      const dbPath = path.join(DATABASE_PATH, `${storageId}.duckdb`)
      const duckdbInstance = await Duckdb.DuckDBInstance.create(dbPath)
      const duckdb = await duckdbInstance.connect()

      const detailsTableName = "details"
      const htmlTableName = "html"

      await duckdb.run(`
        CREATE TABLE IF NOT EXISTS ${detailsTableName} (
          txId STRING PRIMARY KEY,

          arnsName STRING NOT NULL,
          wayfinderUrl STRING NOT NULL,
          gatewayUrl STRING NOT NULL,
          charset STRING NOT NULL,
          language STRING,
          title STRING NOT NULL,
          description STRING,
          
          headers MAP(STRING, STRING),
          absoluteUrls STRING[],
          relativeUrls STRING[],
          openGraph MAP(STRING, STRING),
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ${htmlTableName} (
          txId VARCHAR PRIMARY KEY,
          normalizedHtml TEXT,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `)

      // Load existing TX IDs to avoid duplicates
      const txIds = (await duckdb.runAndReadAll(`SELECT txId FROM ${detailsTableName}`))
        .getRowObjects()
        .filter((row) => !!row.txId)
        .map((row) => row.txId)

      const seenTxIds = new Set(txIds)

      return {
        save: (data: Entities.PageData) =>
          Utils.tryCatch(async () => {
            if (seenTxIds.has(data.txId)) throw new Error(`Duplicate txId: ${data.txId}`)

            seenTxIds.add(data.txId)

            await duckdb.run(
              `
            INSERT INTO ${detailsTableName}
            (arnsName, wayfinderUrl, gatewayUrl, txId, charset, language, title, description, 
            headers, absoluteUrls, relativeUrls, openGraph)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              ],
            )

            await duckdb.run(
              `
            INSERT INTO ${htmlTableName}
            (txId, normalizedHtml)
            VALUES (?, ?)
            `,
              [data.txId, data.normalizedHtml],
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
