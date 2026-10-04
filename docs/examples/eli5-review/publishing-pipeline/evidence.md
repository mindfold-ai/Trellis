# Redacted documentation excerpt

The pipeline collects sources, writes a source document and manifest, generates audio, uploads and verifies public URL/MIME/byte length, records audio identity, then atomically replaces RSS. Audio generation or verification failure does not change public RSS. Shadow mode stops before publication. Same-date reruns replace an existing GUID.

Project, person, account, URL, and local-path identifiers are omitted. This excerpt is documentation, not a test report.
