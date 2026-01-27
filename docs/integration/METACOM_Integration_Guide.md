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
- **Starttafel**: Die Metacom-Integration erwartet eine definierte Starttafel mit der ID `start`. Importierte Board-Pakete müssen diese Starttafel enthalten.

## Related Docs
- `docs/planning/METACOM_INTEGRATION_PLAN.md`
- `docs/planning/TODO.md`
