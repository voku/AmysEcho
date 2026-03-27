# Metacom Integration Guide

This guide outlines the planned integration of Metacom-compatible boards into Amy's Echo.
It complements the detailed implementation plan in
`docs/planning/METACOM_INTEGRATION_PLAN.md`.

## Scope
- Importing Metacom-compatible board definitions and symbol sets.
- Rendering stable grid layouts with category colors and German UI labels.
- Maintaining offline-first behavior and fast response times.
- Providing safe migration paths for existing boards.
- Accepting Open Board Format (`.obf`) and Metacom JSON bundles for local imports.

## Status
- **Planning**: Complete (see the plan document).
- **Implementation**: Initial webapp board view is available (`/symbole`) with a starter Metacom layout and admin import for Metacom bundles.
- **Licensing**: Symbols are provided by users via import; no bundled symbol sets are shipped.
- **Help**: A JSON template is available for download in the admin area.
- **Start board**: The Metacom integration expects a defined start board with the ID `start`. Imported board packages must include this start board.

## Related Docs
- `docs/planning/METACOM_INTEGRATION_PLAN.md`
- `docs/planning/TODO.md`
- `docs/analysis/CONSOLIDATED_WORKFLOW_ALIGNMENT_BLIND_SPOT_ANALYSIS_2026-03.md`


## Multimodal Recognition Hand-off

Metacom-Integration ist der Bedeutungs-Layer hinter der Erkennung. Damit die Kette robust bleibt, sollte der Hand-off immer explizit geprüft werden:

- Erkanntes Label aus dem multimodalen Modell muss deterministisch auf Metacom-`symbolId` und `boardId` gemappt werden.
- Für Kernwörter muss ein stabiler Fallback existieren (wenn ein Symbolpaket unvollständig importiert wurde).
- Release-Freigabe sollte sowohl Erkennungsqualität als auch Mapping-Korrektheit enthalten (nicht nur Modellmetriken).

Siehe vollständige End-to-End-Risikoanalyse: `docs/analysis/CONSOLIDATED_WORKFLOW_ALIGNMENT_BLIND_SPOT_ANALYSIS_2026-03.md`.
