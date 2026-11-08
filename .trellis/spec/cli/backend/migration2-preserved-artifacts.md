# Plan2 preserved Task artifact snapshots

Plan2 `files[].source` additionally accepts this content-free shape:

```json
{
  "target": { "kind": "project", "workspace": "main", "path": ".trellis/tasks/example/research/snapshot.bin" },
  "owner": "preserve",
  "action": "preserve",
  "source": { "sha256": "<64 lowercase hexadecimal characters>", "mode": 384 }
}
```

`mode` is the existing numeric permission mode (`384` is `0o600`). This is a
closed `{sha256, mode}` alternative to the unchanged raw snapshot
`{content_base64, sha256, mode}`. It is allowed only for raw-preserved descendants
of an explicitly inventoried Task in that same workspace. It does not authorize
writes, removals, template/workflow decisions, root Task records, bindings or
sessions. Those parsed/written inputs retain complete raw snapshots. A nested
snapshot named `task.json` is an ordinary artifact unless its exact same-workspace
path is one of the plan's root Task records.

Hash live file bytes incrementally with bounded buffers; never decode a preserved
artifact into a JSON/base64 string or load its whole file merely to compare its
preimage. Preview, apply and replay compare the exact live SHA-256 and mode;
changed bytes or permissions reject before further mutation. Preserve actions
have equal before/after digest/mode and never invoke a writer. Caller backup and
rollback still preserve the original large file; the digest is not a backup.

The Plan2 schema remains `2.0`, Task schema `2.0`, Delivery API `1.0`, and CLI/Core
package versions stay matched. This extends the plan-input contract and internal
`MigrationPlan2` file-source type. No public CLI root export, Core export subpath,
function signature or current Task schema changes. Older executors reject this
shape; use both packages built cleanly from the exact reviewed source SHA with
matching templates, lockfile and artifact hashes. Equal version strings alone
are insufficient. Do not replace an existing npm version or mix Core from an
older source with the new CLI.
