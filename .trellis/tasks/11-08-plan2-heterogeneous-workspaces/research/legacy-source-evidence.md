# Historical Guru extension evidence

Observed original fields in `guru_ai_roleplay_dev`:
- `.trellis/tasks/archive/2026-07/07-21-generated-media-unliked-reaction-state/task.json:43-49`: all seven fields with string/bool/object types.
- `.trellis/tasks/archive/2026-07/07-20-app-start-device-info-log/task.json:40-44`: `design_package` and `requirement_package` legitimately null.
- Owning historical source: commit `e69166fbb023f165aa483998750fdd19df81bcfa`, `.trellis/scripts/guru/guru_gate.py:577-644` and `.trellis/scripts/guru/guru_after_create.py:183-186`.

Only the legacy predecessor classifier accepts these closed fields. Preserve original bytes in migration history; do not create native lifecycle gates from `guru_gates`.
