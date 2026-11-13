# Public adoption contract

The additive installed capability is `common.delivery_store.GitCandidateContent`.
Use it through the existing public module projection. API-1.0 DTOs and the
filesystem `candidate_content_ref(root, paths, kind)` signature remain unchanged.

```python
with projection._call(
    projection.api.delivery_store.GitCandidateContent,
    actual_repository,
    no_lazy_fetch=True,
) as content:
    digest = projection._call(content.content_ref, exact_actual_commit, paths)
```

`paths` is a nonempty unique list of accepted relative file/deletion paths.
The commit must be a full actual lowercase commit OID in that repository.
The returned digest uses the original path/mode/content serialization. The
caller still compares its expected candidate and all Task/Delivery, authority,
ownership, ancestry and recovery facts independently.

A standalone recovery owns one context. A history query may reuse it for
multiple immutable candidates in one operation. The history preparation owner
must close/recreate it whenever preparation changes the actual repository,
including a switch to an isolated bare scratch repository. Run the public
digest inside the existing prepare/retry boundary so missing trees/blobs still
return to that preparation owner. Do not first materialize the old snapshot or
read its bodies and then invoke the new digest: that duplicates object traffic.

Pass `no_lazy_fetch=True` for the historical no-lazy-fetch policy. The context
cleans inherited Git redirects and fixes diagnostic locale for the narrow
old-Git compatibility path. Git 2.36+ uses metadata-only commit control plus
blob contents in one bounded batch-command. Older Git uses a separate metadata
assertion when it explicitly rejects that option. Old Task/local_commit callers
retain their original128-request default. New immutable contexts use at most4096
requests per batch, including the commit control request.

Capability detection may select the additive class. The old filesystem route
remains a compatible fallback, but that fallback cannot satisfy immutable
snapshot reuse acceptance. Do not import private observations, inject caller
hash facts, copy the digest algorithm, patch generated scripts or trust inodes.

The isolated pinned consumer patch is a migration prototype. It is not an
upgrade of the downstream repository. After upstream release, the original
downstream #589 Task owns matching installation, production integration checks
and its whole-Task Completion. The upstream evidence must not manufacture that
downstream outcome.
