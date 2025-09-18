import crypto from "node:crypto"
import * as Superminhash from "superminhash"

import * as Utils from "../utils.js"
import type * as PageDeduplicator from "../ports/pageDeduplicator.js"

const SIGNATURE_SIZE = 128
const SEED = 1984

export default class SuperminhashMemoryPageDeduplicator
  implements PageDeduplicator.PageDeduplicatorUtil
{
  #log = Utils.getLogger("SuperminhashMemoryPageDeduplicator")

  async open(storageId: string, similarityThreshold: number) {
    this.#log.debug({ msg: "opening storage", storageId, similarityThreshold })

    const hashStore: Superminhash.SuperMinHash[] = []

    if (similarityThreshold < 0 || similarityThreshold > 1)
      return Utils.error(new Error("similarityThreshold must be between 0 and 1"))

    const exactDuplicateStore = new Set<string>()

    return Utils.ok({
      check: async (data: string) => {
        const htmlHash = crypto.createHash("sha256").update(data).digest("hex")
        if (exactDuplicateStore.has(htmlHash)) return Utils.ok({ isDuplicate: true, similarity: 1 })

        const newHash = new Superminhash.SuperMinHash(SIGNATURE_SIZE, SEED)
        newHash.add(data.split(/\s+/))

        let isDuplicate = false
        let similarity = 0
        for (const storedHash of hashStore) {
          similarity = newHash.similarity(storedHash)
          if (similarity >= similarityThreshold) {
            isDuplicate = true
            break
          }
        }

        exactDuplicateStore.add(htmlHash)
        hashStore.push(newHash)

        return Utils.ok({ isDuplicate, similarity })
      },
    })
  }
}
