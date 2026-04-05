# Gesture ↔ Sign Terminology Compatibility Checklist

Use this checklist whenever we touch naming or user-facing copy that bridges
“gesture” and “sign” terminology across the system.

## ✅ API Payload Compatibility
- [ ] POST `/api/v1/dgs/samples` still accepts `label` and `landmarks` fields
- [ ] Training bundle metadata uses the same keys (`label`, `profileId`, `modalities`)
- [ ] Client payloads still serialize frames under `landmarks.json` with the same structure

## ✅ Stored Data Compatibility
- [ ] `server/data/dgs_samples.json` remains readable by existing ingestion tooling
- [ ] `server/data/datasets/training_manifest.json` still parses with current schema
- [ ] Cached landmarks (`landmarks_cached.json`) remain backward compatible


## 📌 Standard-Terminologie (Sign-Language-Erkennung)
- **User-facing Standardbegriff:** „Gebärde“
- Verwende in der UI und in Amy-sichtbaren Hinweisen/Formulierungen **nicht** „Geste(n)“ oder „Zeichen“, wenn Sign-Language-Erkennung gemeint ist.
- Bevorzugte Formulierungen: „Gebärde erkannt“, „keine passende Gebärde“, „keine gültige Gebärde“.

## ✅ User-Facing German Copy Audit
- [ ] UI labels and error messages remain in German
- [ ] Any new copy uses “Gebärde” consistently where user-facing
- [ ] No English “gesture” or “sign” strings leak into the UI

## ✅ Tests and Fixtures
- [ ] Training bundle fixtures include the same naming keys
- [ ] Integration tests still pass against existing dataset fixtures
- [ ] Baseline model fixture smoke tests pass in both Python and TypeScript
