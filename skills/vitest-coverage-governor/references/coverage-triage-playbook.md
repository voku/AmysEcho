# Coverage Triage Playbook

1. Run coverage command and capture failing metric(s).
2. Locate the lowest-covered changed file(s) first.
3. Add tests for missed branches, not only happy path.
4. Re-run focused tests and confirm branch/line/function improvements.
5. Re-run full coverage gate and record final numbers.
