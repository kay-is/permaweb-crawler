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
  #log = Utils.getLogger("DuckdbPageDataStorage")

  async open(storageId: string) {
    const dbPath = path.join(DATABASE_PATH, `${storageId}.duckdb`)
    this.#log.debug({ msg: "opening database", storageId, databasePath: dbPath })

    await fs.mkdir(DATABASE_PATH, { recursive: true })
    const duckdbInstance = await Duckdb.DuckDBInstance.create(dbPath)
    const duckdb = await duckdbInstance.connect()

    const detailsTableName = "details"
    const htmlTableName = "html"

    const initializingTables = await Utils.tryCatch(async () => {
      await duckdb.run(`
        CREATE TABLE IF NOT EXISTS ${detailsTableName} (   
          url VARCHAR NOT NULL,

          arnsName VARCHAR NOT NULL,
          txId VARCHAR NOT NULL,
          dataId VARCHAR NOT NULL,

          charset VARCHAR NOT NULL,
          language VARCHAR,
          title VARCHAR NOT NULL,
          description VARCHAR,
          
          absoluteUrls VARCHAR[],
          relativeUrls VARCHAR[],
          openGraph MAP(VARCHAR, VARCHAR)
        );

        CREATE TABLE IF NOT EXISTS ${htmlTableName} (
          url VARCHAR PRIMARY KEY,
          normalizedHtml VARCHAR NOT NULL
        );
      `)
    })

    if (initializingTables.failed) return initializingTables

    return Utils.ok({
      save: (data: Entities.PageData) =>
        Utils.tryCatch(async () => {
          await duckdb.run(
            `
            INSERT INTO ${detailsTableName}
            (url, arnsName, txId, dataId, charset, language, title, description, 
             absoluteUrls, relativeUrls, openGraph)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              data.wayfinderUrl,

              data.arnsName,
              data.txId,
              data.dataId,

              data.charset,
              data.language,
              data.title,
              data.description,

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
            (url, normalizedHtml)
            VALUES (?, ?)
            `,
            [data.wayfinderUrl, data.normalizedHtml],
          )
        }),
      export: () =>
        Utils.tryCatch(async () => {
          await fs.mkdir(EXPORTS_PATH, { recursive: true })

          await duckdb.run(`
              COPY ${detailsTableName}
              TO '${path.join(EXPORTS_PATH, `${storageId}-details.parquet`)}' 
              (FORMAT PARQUET, COMPRESSION ZSTD, COMPRESSION_LEVEL 10, ROW_GROUP_SIZE 100000);
              
              COPY ${htmlTableName} 
              TO '${path.join(EXPORTS_PATH, `${storageId}-html.parquet`)}' 
              (FORMAT PARQUET, COMPRESSION ZSTD, COMPRESSION_LEVEL 10, ROW_GROUP_SIZE 100000);
            `)
        }),
      close: () =>
        Utils.tryCatch(async () => {
          duckdb.closeSync()
          await fs.unlink(path.join(DATABASE_PATH, `${storageId}.duckdb`))
          this.#log.debug({ msg: "closed and deleted database", storageId, databasePath: dbPath })
        }),
    })
  }
}
