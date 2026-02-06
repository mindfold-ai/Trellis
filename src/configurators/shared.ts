/**
 * Shared utilities for platform configurators.
 *
 * Extracted here to avoid circular dependencies (index.ts imports configurators,
 * configurators cannot import from index.ts).
 */

/**
 * Get the Python command based on platform.
 * Windows uses 'python', macOS/Linux use 'python3'.
 */
function getPythonCommand(): string {
  return process.platform === "win32" ? "python" : "python3";
}

/**
 * Resolve platform-specific placeholders in template content.
 * Used by both init (configurators) and update (collectTemplates in index.ts).
 */
export function resolvePlaceholders(content: string): string {
  return content.replace(/\{\{PYTHON_CMD\}\}/g, getPythonCommand());
}
