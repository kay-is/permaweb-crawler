import fs from "node:fs"
import { ParquetSchema, ParquetWriter } from "@dsnp/parquetjs"
import path from "node:path"

const schema = new ParquetSchema({
  url: { type: "UTF8", compression: "SNAPPY" },
  gatewayUrl: { type: "UTF8", compression: "SNAPPY" },
  headers: {
    repeated: true,
    fields: {
      name: { type: "UTF8" },
      value: { type: "UTF8", compression: "SNAPPY" },
    },
  },
  charset: { type: "UTF8" },
  language: { type: "UTF8" },
  title: { type: "UTF8", compression: "SNAPPY" },
  description: { type: "UTF8" },
  openGraph: {
    repeated: true,
    fields: {
      property: { type: "UTF8" },
      content: { type: "UTF8", compression: "SNAPPY" },
    },
  },
  relativeUrls: { type: "UTF8", repeated: true, compression: "SNAPPY" },
  absoluteUrls: { type: "UTF8", repeated: true, compression: "SNAPPY" },
  normalizedHtml: { type: "UTF8", compression: "SNAPPY" },
})

const parquetFile = await ParquetWriter.openFile(schema, "docs.parquet")

const storageDir = "storage/datasets/19c770dc-33e6-4ba8-ab12-3dec001fa8a8"

const fileNames = fs.readdirSync(storageDir)

for (const fileName of fileNames) {
  const fileContentString = fs.readFileSync(path.join(storageDir, fileName), { encoding: "utf-8" })
  const fileContentObject: any = JSON.parse(fileContentString)
  await parquetFile.appendRow(fileContentObject)
}

await parquetFile.close()

console.log("Final size: ", (fs.statSync("docs.parquet").size / 1024 / 1024).toFixed(4))
