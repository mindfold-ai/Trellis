import { PATHS } from "../constants/paths.js";
import type { TemplateHashes } from "../types/template-hashes.js";
import { computeHash } from "./template-hash.js";
import { isBundledWorkflow } from "./workflow-resolver.js";

/** Project reviewed workflow ownership into a receipt without reading or writing it. */
export function projectWorkflowHashes(
  hashes: TemplateHashes,
  templateId: string,
  content: string,
): TemplateHashes {
  const { [PATHS.WORKFLOW_GUIDE_FILE]: _previous, ...remaining } = hashes;
  return isBundledWorkflow(templateId)
    ? { ...remaining, [PATHS.WORKFLOW_GUIDE_FILE]: computeHash(content) }
    : remaining;
}
