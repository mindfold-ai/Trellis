import { createHash } from "node:crypto"

const PART_ID_PATTERN = /^prt_([0-9a-f]{12})[0-9A-Za-z]{14}$/
const CONTEXT_PART_KINDS = {
  sessionStart: { offset: 2n, slot: "0" },
  workflowState: { offset: 1n, slot: "1" },
}
const MAX_CONTEXT_PART_OFFSET = Object.values(CONTEXT_PART_KINDS).reduce(
  (maximum, definition) => definition.offset > maximum ? definition.offset : maximum,
  0n,
)

/**
 * Return the first ordinary user-authored text part.
 *
 * Trellis plugins can run in either order, so callers must not mistake a
 * synthetic context part inserted by another plugin for the user's prompt.
 */
export function findUserTextPart(parts) {
  if (!Array.isArray(parts)) return undefined
  return parts.find(
    part => part?.type === "text" && part.synthetic !== true && part.text !== undefined,
  )
}

function findIdentitySourcePart(parts) {
  return parts
    .filter(
      part =>
        part?.synthetic !== true &&
        typeof part?.id === "string" &&
        typeof part?.sessionID === "string" &&
        typeof part?.messageID === "string" &&
        PART_ID_PATTERN.test(part.id),
    )
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))[0]
}

function contextPartId(source, kind) {
  const definition = CONTEXT_PART_KINDS[kind]
  if (!definition) throw new TypeError(`unknown context part kind: ${kind}`)

  const match = PART_ID_PATTERN.exec(source.id)
  if (!match) throw new TypeError(`unsupported OpenCode part ID: ${source.id}`)
  const sourceOrdinal = BigInt(`0x${match[1]}`)
  if (sourceOrdinal <= MAX_CONTEXT_PART_OFFSET) {
    throw new TypeError(`unsupported OpenCode part ID ordinal: ${source.id}`)
  }
  const ordinal = sourceOrdinal - definition.offset
  const suffix = createHash("sha256")
    .update(`${source.messageID}\0${kind}`)
    .digest("hex")
    .slice(0, 13)
  return `prt_${ordinal.toString(16).padStart(12, "0")}${definition.slot}${suffix}`
}

/**
 * Persist machine-authored context ahead of the ordinary user parts without
 * mutating any existing part. The generated identity sorts before the source
 * user part in the same order during both the first request and stored replay.
 */
export function insertSyntheticTextPart(parts, text, kind) {
  if (!Array.isArray(parts)) throw new TypeError("parts must be an array")
  if (typeof text !== "string") throw new TypeError("text must be a string")
  if (!CONTEXT_PART_KINDS[kind]) throw new TypeError(`unknown context part kind: ${kind}`)

  const source = findIdentitySourcePart(parts)
  if (!source) throw new TypeError("no ordinary OpenCode part with a persisted identity")

  const id = contextPartId(source, kind)
  if (parts.some(part => part?.id === id)) {
    throw new TypeError(`duplicate synthetic context part: ${kind}`)
  }
  const part = {
    id,
    sessionID: source.sessionID,
    messageID: source.messageID,
    type: "text",
    text,
    synthetic: true,
  }
  const insertionIndex = parts.findIndex(existing => typeof existing?.id !== "string" || id < existing.id)
  if (insertionIndex === -1) parts.push(part)
  else parts.splice(insertionIndex, 0, part)
  return part
}
