# Load Module Memory

Load AOSP module memory into the current session context on demand.

**Usage**: `/trellis:load-module <module>`

Modules: `systemui` | `launcher` | `framework` | `codebase` | `cross-layer`

---

## Steps

Execute these steps based on the `$ARGUMENTS` (module name):

1. **Validate argument**

   If no argument provided, list available modules and stop:
   ```
   Available modules: systemui | launcher | framework | codebase | cross-layer
   Usage: /trellis:load-module <module>
   ```

2. **Map module to directory**

   | Argument | Directory |
   |----------|-----------|
   | `systemui` | `docs/memory/systemui/` |
   | `launcher` | `docs/memory/launcher/` |
   | `framework` | `docs/memory/framework/` |
   | `codebase` | `docs/memory/codebase/` |
   | `cross-layer` | `docs/memory/cross_layer/` |

3. **Read all `.md` files in the directory**

   ```bash
   ls docs/memory/<module>/
   ```

   For each file:
   - Read the YAML frontmatter (first ~10 lines)
   - Check the `confidence` field
   - **Skip** files where `confidence: pending` (unfilled templates)
   - **Load** files where `confidence: inferred` or `confidence: validated`

4. **Output loaded content**

   For each loaded file, output:
   ```
   ### <filename> (confidence: <value>)
   <file content>
   ```

5. **For cross-layer**: also load `docs/memory/codebase/CODEBASE_MAP.md` as additional context

6. **Summary**

   Report:
   - How many files were loaded vs skipped
   - Which files were skipped (pending)
   - Suggest: "Run `/trellis:validate-memory` to see overall memory population status"

---

## Notes

- This command is for mid-session context refresh — session start automatically loads `codebase/CODEBASE_MAP.md` and `codebase/MODULE_OWNERSHIP.md` (if not pending)
- Use this when switching module focus mid-session, or when the hook-injected memory is not sufficient for the current task
- After the AI fills in memory files and updates their `confidence` field, reload with this command to pick up the new content
