import fs from "node:fs"
import path from "node:path"
import * as TurboSdk from "@ardrive/turbo-sdk"
import type * as ArweaveWallet from "arweave/node/lib/wallet.js"

import * as Utils from "../utils.js"
import type * as Entities from "../entities.js"
import type * as PageDataUploader from "../ports/pageDataUploader.js"

const EXPORTS_DIRECTORY = path.join(process.cwd(), "storage/exports")

export default class TurboSdkPageDataUploader implements PageDataUploader.PageDataUploaderOutput {
  #log = Utils.getLogger("TurboSdkPageDataUploader")

  #walletPath = path.resolve(process.env.TURBO_SDK_WALLET || "wallet.json")

  async upload(taskId: string): Utils.PromisedResult<Entities.ArweaveTxId> {
    this.#log.info({ msg: "loading wallet", taskId: taskId, walletPath: this.#walletPath })

    const loadingWallet = await Utils.tryCatch(
      () => JSON.parse(fs.readFileSync(this.#walletPath, "utf-8")) as ArweaveWallet.JWKInterface,
    )
    if (loadingWallet.failed) return loadingWallet

    const turboClient = TurboSdk.TurboFactory.authenticated({ privateKey: loadingWallet.data })

    let costs = 0n

    this.#log.debug({
      msg: "uploading details",
      taskId,
      filePath: path.join(EXPORTS_DIRECTORY, `${taskId}-details.parquet`),
    })

    const uploadingDetails = await Utils.tryCatch(() =>
      turboClient.uploadFile({
        file: path.join(EXPORTS_DIRECTORY, `${taskId}-details.parquet`),
        dataItemOpts: { tags: [{ name: "Content-Type", value: "application/octet-stream" }] },
      }),
    )

    if (uploadingDetails.failed) return uploadingDetails

    costs += BigInt(uploadingDetails.data.winc)

    this.#log.debug({
      msg: "uploading html",
      taskId,
      filePath: path.join(EXPORTS_DIRECTORY, `${taskId}-html.parquet`),
    })

    const uploadingHtml = await Utils.tryCatch(() =>
      turboClient.uploadFile({
        file: path.join(EXPORTS_DIRECTORY, `${taskId}-html.parquet`),
        dataItemOpts: { tags: [{ name: "Content-Type", value: "application/octet-stream" }] },
      }),
    )

    if (uploadingHtml.failed) return uploadingHtml

    costs += BigInt(uploadingHtml.data.winc)

    const pathManifest = {
      manifest: "arweave/paths",
      version: "0.2.0",
      paths: {
        "details.parquet": { id: uploadingDetails.data.id },
        "html.parquet": { id: uploadingHtml.data.id },
      },
    }
    this.#log.debug({ msg: "uploading path manifest", taskId, pathManifest })

    const uploadingManifest = await Utils.tryCatch(() =>
      turboClient.upload({
        data: JSON.stringify(pathManifest),
        dataItemOpts: {
          tags: [{ name: "Content-Type", value: "application/x.arweave-manifest+json" }],
        },
      }),
    )
    if (uploadingManifest.failed) return uploadingManifest

    costs += BigInt(uploadingManifest.data.winc)

    this.#log.info({
      msg: "uploaded page data",
      taskId,
      arweaveTxId: uploadingManifest.data.id,
      costs: costs.toString(),
    })

    return Utils.ok(uploadingManifest.data.id)
  }
}
