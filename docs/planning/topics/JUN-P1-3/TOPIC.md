# JUN-P1-3 — Terminology quality gate

## Kanban Status
- **Column:** Done
- **Owner:** Team
- **Last updated:** 2026-04-02

## Amy impact
- Added recurring terminology checks for user-facing sign-language wording quality.

## Scope
- Preserve evidence context and acceptance summary for this completed roadmap item.

## Entry points
- `scripts/check-terminology.sh`
- `docs/guides/TERMINOLOGY_COMPATIBILITY_CHECKLIST.md`

## Evidence required for Done
- Quality gate script and checklist integrated into full checks.

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Next command
- `rg -n "JUN" docs/planning docs/testing server/test scripts`
