import fs from "node:fs";
import path from "node:path";

const OWNED_CHILDREN = new Set([
  "scripts",
  "agents",
  "tasks",
  "spec",
  ".runtime",
  ".cache",
  ".version",
  ".template-hashes.json",
  ".gitignore",
  "workflow.md",
  "config.yaml",
]);

export function ownedTrellisChildren(trellisDir: string): string[] {
  return fs.readdirSync(trellisDir).filter((name) => OWNED_CHILDREN.has(name));
}

export function removeOwnedTrellisData(trellisDir: string): void {
  if (fs.lstatSync(trellisDir).isSymbolicLink()) {
    throw new Error("Removal refused for a linked .trellis root.");
  }
  for (const name of ownedTrellisChildren(trellisDir)) {
    fs.rmSync(path.join(trellisDir, name), { recursive: true, force: true });
  }
  if (fs.readdirSync(trellisDir).length === 0) fs.rmdirSync(trellisDir);
}
