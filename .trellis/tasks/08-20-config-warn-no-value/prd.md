# Warn without echoing the ignored YAML value

## Context

`.trellis/scripts/common/trellis_config.py` parses `.trellis/config.yaml` with a
small hand-rolled reader that deliberately supports a subset of YAML. When it
meets a construct it cannot represent — a block scalar, an anchor/alias, a
mapping nested inside a list — it drops the line and warns:

```python
def _warn_unsupported(source: str, lineno: int, line: str, reason: str) -> None:
    """Report a YAML construct this parser cannot represent, and move on."""
    print(
        f"[WARN] {source}:{lineno}: {reason}; ignoring: {line.strip()}",
        file=sys.stderr,
    )
```

The whole raw line goes to stderr, value included. Raised by Copilot on
platypeeps/people-profiles#4 as a possible way for a secret in a user-edited
`config.yaml` to reach a CI log.

## Assessment

Low severity, worth fixing anyway.

Against it being urgent: `config.yaml` is tracked project configuration — task
directories, platform list, breadcrumb templates — committed in every consumer
repo, so it is not where secrets live, and a secret already committed there is
exposed by the file, not by this warning. The warning also fires only on the
handful of constructs the parser refuses, never on the normal path.

For fixing it: the value earns nothing. Everything that makes the warning
actionable — which file, which line, which key, why it was dropped — survives
without it, so echoing the value is cost with no diagnostic return.

## Requirements

1. `_warn_unsupported` must not print the value portion of the offending line.
2. It must still name the source file, the 1-based line number, the key (where
   the construct has one — a list item like `- name: cli` does), and the reason.
3. Behaviour is otherwise unchanged: same call sites, same "drop the line and
   continue" semantics, same stream (stderr), same `[WARN]` prefix.

## Acceptance criteria

- A `config.yaml` whose unsupported line carries a distinctive value string
  produces a warning that contains the key and the reason and does **not**
  contain that value string.
- Existing `trellis_config` tests pass unchanged, or are updated only where
  they assert on the value text specifically.
- `.trellis/scripts/common/trellis_config.py` stays byte-identical to
  `packages/cli/src/templates/trellis/scripts/common/trellis_config.py`
  (regression parity guard).

## Out of scope

Redacting anything else, adding a secret-detection heuristic, or changing which
constructs the parser supports.
