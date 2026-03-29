# Detection Debug Checklist

Use this order to avoid noisy debugging:

1. Verify model/version endpoint is reachable and profile scope is correct.
2. Verify model loads successfully before camera inference starts.
3. Confirm fixtures reproduce the issue (`npm run diagnose:fixtures --prefix webapp`).
4. Inspect confidence threshold and top1-top2 margin decisions.
5. Confirm abstention behavior for low-confidence frames.
6. Confirm diagnostics text explains likely cause (camera/hand visibility/confidence/profile mismatch).
7. Re-run focused tests and type-check after changes.
