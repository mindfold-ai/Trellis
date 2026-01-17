# Feature: remove-txt-templates

## Overview

Remove the duplicated `.txt` template files under `src/templates/` and refactor the template system to read directly from the Trellis project's own `.trellis/` directory. This implements the "eat your own dog food" (dogfooding) principle - Trellis uses its own actual configuration files as the source of truth for templating.

## Background

Currently, the template system maintains duplicate content:
- `src/templates/markdown/*.md.txt` duplicates `.trellis/structure/**/*.md`
- `src/templates/scripts/*.sh.txt` duplicates `.trellis/scripts/*.sh`
- `src/templates/commands/**/*.txt` contains command templates

This duplication requires maintaining two copies of the same content and creates drift risk.

## Requirements

1. **Refactor `src/templates/extract.ts`**
   - Create a `getTrellisSourcePath()` utility that resolves to the `.trellis/` directory
   - Update `readMarkdown()` to read from `.trellis/structure/` instead of `src/templates/markdown/`
   - Update `readScript()` to read from `.trellis/scripts/` instead of `src/templates/scripts/`

2. **Update Template Index Files**
   - Update `src/templates/markdown/index.ts` to export content from `.trellis/structure/**/*.md`
   - Update `src/templates/scripts/index.ts` to export content from `.trellis/scripts/*.sh`
   - Keep the same exported variable names for backward compatibility

3. **Remove `.txt` Template Files**
   - Delete all `src/templates/markdown/**/*.md.txt` files
   - Delete all `src/templates/scripts/**/*.sh.txt` files
   - Keep `src/templates/commands/` (these don't have .trellis counterparts yet)
   - Keep `src/templates/agents/bodies/*.md` (already native format)
   - Keep `src/templates/hooks/` (already native format)

4. **Update `package.json` for npm Distribution**
   - Ensure `.trellis/` directory is included in the npm package `files` array
   - Verify the paths resolve correctly when installed as an npm package

## Acceptance Criteria

- [ ] `trellis init` command works correctly and creates the same output as before
- [ ] No `.txt` files remain in `src/templates/markdown/` and `src/templates/scripts/`
- [ ] The exported template strings in `markdown/index.ts` and `scripts/index.ts` remain unchanged
- [ ] All configurators (`workflow.ts`, `claude.ts`, `cursor.ts`) continue to work
- [ ] `npm run build` succeeds without errors
- [ ] When Trellis is installed as an npm package, templates are still accessible

## Technical Notes

1. **Existing Pattern Reference**: Agent templates (`src/templates/agents/bodies/*.md`) already use native `.md` format without `.txt` extension - this pattern works and should be followed.

2. **Path Resolution**: Need to handle both development mode (running from source) and installed mode (running as npm package). Consider using `__dirname` relative paths that work in both contexts.

3. **Backward Compatibility**: The external API (exported template strings from index files) must remain unchanged. Configurators import these strings and should not need modification.

4. **Build Consideration**: Since templates are read at runtime via `fs.readFileSync`, ensure the `.trellis/` files are bundled in the npm package distribution.

## Out of Scope

- Refactoring `src/templates/commands/` - these don't have `.trellis/` counterparts
- Changing how agents or hooks templates work - they already use the correct pattern
- Creating new `.trellis/` structure files - only use existing ones
- Changing the configurator APIs or behavior
