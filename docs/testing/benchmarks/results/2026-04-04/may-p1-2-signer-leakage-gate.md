# MAY-P1-2 Evidence — Signer Leakage Hard Quality Gate

- Date: 2026-04-04
- Topic: `MAY-P1-2`
- Scope: confirm signer-leakage validation is hard-gated for few-shot workflow and test coverage stays green.

## Verification commands

```bash
pytest server/test/test_train_mlp_fewshot.py server/test/test_train_mlp_signer_split.py -q
pytest server/test/test_train_mlp_sweep.py -q
```

## Results summary

- `test_train_mlp_fewshot.py` + `test_train_mlp_signer_split.py`: **19 passed**
- `test_train_mlp_sweep.py`: **8 passed**

## Gate coverage confirmation

- Split-manifest signer overlap rejection is covered in:
  - `server/test/test_train_mlp_fewshot.py::test_validate_split_manifest_rejects_signer_overlap`
  - `server/test/test_train_mlp_signer_split.py::test_validate_manifest_signer_split_rejects_overlapping_profiles`
- Bundle overlap rejection is covered in:
  - `server/test/test_train_mlp_fewshot.py::test_validate_split_manifest_rejects_bundle_overlap`
  - `server/test/test_train_mlp_signer_split.py` bundle overlap assertions via split validation.
- Few-shot/sweep output reporting includes signer-split validation payload assertions in:
  - `server/test/test_train_mlp_signer_split.py::test_sweep_includes_signer_split_validation_in_output`

## Outcome

MAY-P1-2 evidence is now committed: signer leakage is enforced as a hard gate in the tested few-shot/sweep paths, and signer-split diagnostics remain present in output payload checks.
