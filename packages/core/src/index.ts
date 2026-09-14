// Root barrel — re-exports the channel and task public APIs so callers
// can `import { ... } from "@mindfoldhq/trellis-core"`. Sub-path
// imports (`@mindfoldhq/trellis-core/channel`, `/task`) remain the
// recommended form for tree-shake-friendly consumption.

export * from "./channel/index.js";
export * from "./task/index.js";
export {
  assertActiveDataPath,
  isRetiredDataPath,
  resolveTrellisDataRoot,
  RetiredDataAccessError,
} from "./retired-data.js";
