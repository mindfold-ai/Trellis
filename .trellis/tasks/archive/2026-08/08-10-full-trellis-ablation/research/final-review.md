# Final independent review

The independent full-scope review identified three recovery-state hardening
gaps and made no direct edits:

1. restore did not revalidate that the configured state root resolved outside
   the project;
2. staging used path checks but did not run the complete strict state schema
   before publishing;
3. persisted backup paths were safe relative paths but were not required to
   equal `backup/<entry.relativePath>`.

All three were confirmed. GitNexus rated the affected parse/stage/load symbols
low risk, limited to the ablate/restore flow and tests. The implementation now:

- resolves the nearest existing state-root ancestor without writing, follows
  symlink ancestry, and refuses inside-project roots on both stage and load;
- parses the in-memory preparing state with the same strict schema used for
  loaded state before creating recovery storage;
- enforces exact backup-path identity for every non-absent entry.

Regression tests cover inside-project and symlink-ancestor roots, zero recovery
storage on invalid staged schema, and mismatched backup paths. The final CLI
suite passed 76 files / 1,712 tests, with package lint, strict typecheck, build,
and the latest CastForge round trip also passing.

The final staged GitNexus comparison against `origin/main` mapped 29 files and
110 symbols into 13 affected flows at high risk. The breadth is expected for a
new destructive/recovery command plus shared uninstall planning; the listed
flows are the intended ablate, restore, and scrub call chains. No unrelated
application process was reported.
