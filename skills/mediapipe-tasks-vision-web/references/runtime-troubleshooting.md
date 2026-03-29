# Runtime Troubleshooting (MediaPipe Web)

1. Confirm model/task asset is reachable from current base URL.
2. Confirm detector instance is created exactly once per lifecycle boundary.
3. Confirm camera permissions and stream state before inference loop starts.
4. Confirm frame timestamps are monotonic where required.
5. Confirm low-confidence behavior is abstain/explain, not forced class.
6. Confirm diagnostics include enough context for caregiver debugging.
