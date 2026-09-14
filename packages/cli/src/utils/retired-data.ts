import fs from "node:fs";
import path from "node:path";
import { isRetiredDataPath } from "@mindfoldhq/trellis-core";

export {
  assertActiveDataPath,
  isRetiredDataPath,
  resolveTrellisDataRoot,
  RetiredDataAccessError,
} from "@mindfoldhq/trellis-core";

/** List only the active children; never stat or enumerate retired entries. */
export function activeTrellisChildren(trellisDir: string): string[] {
  return fs
    .readdirSync(trellisDir)
    .filter(
      (name) => !isRetiredDataPath(path.join(trellisDir, name), trellisDir),
    );
}

export function removeActiveTrellisData(trellisDir: string): void {
  if (fs.lstatSync(trellisDir).isSymbolicLink()) {
    throw new Error(
      "Removal refused for a linked .trellis root; retired history must remain in place.",
    );
  }
  for (const name of activeTrellisChildren(trellisDir)) {
    fs.rmSync(path.join(trellisDir, name), { recursive: true, force: true });
  }
  if (fs.readdirSync(trellisDir).length === 0) {
    fs.rmdirSync(trellisDir);
  }
}
