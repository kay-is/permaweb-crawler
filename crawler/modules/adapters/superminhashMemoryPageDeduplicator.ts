import superminhash from "./superminhashWrapper.cjs"

import * as Utils from "../utils.js"
import type * as PageDeduplicator from "../ports/pageDeduplicator.js"

const SIGNATURE_SIZE = 128
const SEED = 1984

export default class SuperminhashMemoryPageDeduplicator
  implements PageDeduplicator.PageDeduplicatorUtil
{
  #log = Utils.getLogger("SuperminhashMemoryPageDeduplicator")

  #stores: Record<string, superminhash.SuperMinHash[]> = {}

  async open(storageId: string, similarityThreshold: number) {
    this.#log.debug({ msg: "opening storage", storageId, similarityThreshold })

    const hashStore = this.#stores[storageId] || []
    this.#stores[storageId] = hashStore

    if (similarityThreshold < 0 || similarityThreshold > 1)
      return Utils.error(new Error("similarityThreshold must be between 0 and 1"))

    return Utils.ok({
      check: async (data: string) => {
        const tokens = data.split(/\s+/)
        const newHash = new superminhash.SuperMinHash(SIGNATURE_SIZE, SEED)

        newHash.add(tokens)

        let isDuplicate = false
        let similarity = 0
        for (const storedHash of hashStore) {
          similarity = newHash.similarity(storedHash)
          if (similarity >= similarityThreshold) {
            isDuplicate = true
            break
          }
        }

        hashStore.push(newHash)
        return Utils.ok({ isDuplicate, similarity })
      },
    })
  }
}
