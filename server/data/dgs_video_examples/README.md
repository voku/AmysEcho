# DGS Video Archive

This directory contains Deutsche Gebärdensprache (DGS) sign language videos for Amy's Echo.

## Purpose

These videos serve as:
- **Training data** for the baseline gesture recognition model
- **Server pre-training** examples for labels configured in Auto mode
- **Stable local source** for testing and CI/CD without external dependencies

## Amy First

This archive is critical for helping Amy and other kids with special needs:
- ✅ Provides reliable training data without network dependencies
- ✅ Ensures consistent model quality across deployments
- ✅ Enables offline development and testing
- ✅ Supports multiple sign variants for better recognition accuracy

## Contents

- **Video files** (`*.mp4`): DGS sign demonstrations from signdict.org
- **Landmark files** (`*_landmarks.json`): Extracted MediaPipe hand/pose/face landmarks
- Organized by label (e.g., `mama`, `spielen`, `kindergarten`)
- Multiple variants per label for training robustness

## Adding New Videos

To add videos for a new label:

1. **Download from SignDict**: Use `scripts/fetch_signdict_label.py`
   ```bash
   PYTHONPATH=. python3 scripts/fetch_signdict_label.py --label LABEL_NAME
   ```

2. **Process to extract landmarks**: Use `scripts/process_dgs_videos.py`
   ```bash
   python3 scripts/process_dgs_videos.py --videos-dir server/data/dgs_video_examples \
     --models-dir server/data/models --split-output --labels LABEL_NAME
   ```

3. **Commit to repository**: Add both `.mp4` and `_landmarks.json` files
   - This ensures stable, reliable training data
   - Enables testing without external network access

## Test Fixtures

Some videos serve as test fixtures (e.g., `kindergarten_integration_0.mp4`):
- Copied from existing DGS videos to ensure actual sign language content
- Pre-processed with landmarks for fast integration tests
- Named to match integration test expectations

## License

Videos sourced from signdict.org are under their respective licenses.
Always verify license compliance before redistribution.
