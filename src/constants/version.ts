/**
 * Package version and name constants.
 *
 * Extracted from cli/index.ts to avoid import-time side effects
 * (program.parse(), checkForUpdates, etc.) when only VERSION is needed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJson {
  name: string;
  version: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(__dirname, "../../package.json");
const packageJson: PackageJson = JSON.parse(
  fs.readFileSync(packageJsonPath, "utf-8"),
);

export const VERSION: string = packageJson.version;
export const PACKAGE_NAME: string = packageJson.name;
