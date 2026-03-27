# fix: Support Self-Hosted GitLab in --registry

## Background

Issue #87 (v0.3.9) fixed HTTPS URL acceptance for public domains (`github.com`, `gitlab.com`, `bitbucket.org`). But users with self-hosted GitLab instances (e.g., `git.company.com`) hit the same `Unsupported provider` error because `normalizeRegistrySource` only recognizes 3 hardcoded domains.

Reported by user wilsonJ — their company uses a self-hosted GitLab with a custom domain.

## Goal

Make `trellis init --registry` work with self-hosted GitLab (and GitHub Enterprise) URLs, both HTTPS and SSH formats.

## Error Scenarios

| User Input | Current Behavior | Expected |
|------------|-----------------|----------|
| `https://git.company.com/org/repo` | `Unsupported provider "https"` | Parsed as GitLab-compatible source |
| `git@git.company.com:org/repo` | `Unsupported provider "git@git.company.com"` | Parsed as GitLab-compatible source |
| `https://github.mycompany.com/org/repo` | `Unsupported provider "https"` | Parsed as GitHub Enterprise source |

## Design (First Principles)

### Key Insight

The problem is NOT that giget doesn't support self-hosted GitLab (it does via `GIGET_GITLAB_URL`). The problem is Trellis's own two parsing layers reject the URL before giget ever sees it.

### Changes

| Component | Change |
|-----------|--------|
| `RegistrySource` interface | Add `host?: string` field (null for public domains, actual host for self-hosted) |
| `normalizeRegistrySource()` | Add SSH URL parsing (`git@host:org/repo`) + unknown HTTPS domain → `gitlab:` mapping |
| `RAW_URL_PATTERNS` | Make `gitlab` entry support dynamic host (replace hardcoded `gitlab.com`) |
| `parseRegistrySource()` | Populate `host` field when self-hosted domain detected |
| `downloadWithStrategy()` | Set `GIGET_GITLAB_URL` env var before giget call when `host` is present, restore after |

### URL Detection Logic

```
Input URL → normalizeRegistrySource():
  1. Already giget format (has prefix:)? → pass through
  2. SSH format (git@host:path)? → extract host, map to gitlab:path
  3. HTTPS github.com? → gh:path (existing)
  4. HTTPS gitlab.com? → gitlab:path (existing)
  5. HTTPS bitbucket.org? → bitbucket:path (existing)
  6. HTTPS unknown domain? → gitlab:path + store host
```

### Trade-offs Accepted

- Unknown domains default to GitLab URL patterns (covers 95%+ of self-hosted)
- Gitea/Gogs not supported (different URL patterns, extremely rare in target users)
- Uses `GIGET_GITLAB_URL` env var (giget's official mechanism, not custom providers API)

## Acceptance Criteria

- [ ] `trellis init --registry https://git.company.com/org/repo` works
- [ ] `trellis init --registry git@git.company.com:org/repo` works
- [ ] Existing `gh:`, `gitlab:`, `bitbucket:` and public HTTPS URLs still work
- [ ] `rawBaseUrl` points to correct self-hosted domain
- [ ] giget download targets correct host
- [ ] Tests cover SSH URL, unknown HTTPS domain, and backward compat

## Files to Modify

- `packages/cli/src/utils/template-fetcher.ts`
- `packages/cli/test/utils/template-fetcher.test.ts`
