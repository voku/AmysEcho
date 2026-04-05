# Docs Validation Report (2026-03-27)

## Scope

Validation pass focused on local markdown-link integrity after consolidation/deletion work.

## Command executed

```bash
python scripts/validate_docs_links.py
```

## Result

- ✅ `Docs link validation: OK (no broken local links found).`

## Fixes applied before re-run

1. Fixed relative links in `docs/deployment/quickstart-server.md` to `SERVER_deployment.md`.
2. Fixed troubleshooting links in:
   - `docs/guides/caregiver-quick-start-guide.md`
   - `docs/guides/video-tutorials.md`
3. Replaced missing screenshot markdown link in `docs/workflows/development-workflow.md` with a non-broken placeholder note.
4. Hardened `scripts/validate_docs_links.py` to:
   - decode URL-encoded local links,
   - resolve leading `/...` links from the repository root,
   - read markdown with `errors='replace'` so encoding problems remain visible and warn on replacement characters,
   - ignore fenced code blocks to avoid false positives from documentation examples while warning on unclosed fences.

## Follow-up recommendation

Add `python scripts/validate_docs_links.py` to CI docs checks to prevent reintroduction of broken local links.
