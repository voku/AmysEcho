# Amy's Echo Governance Cadence (Security + Accessibility)

**Last updated:** 2026-03-27  
**Scope:** operational governance for security and accessibility validation across webapp, server, and integration flows.

## 1) Cadence overview

| Cadence | Domain | Primary owner | Backup owner | Required evidence |
| --- | --- | --- | --- | --- |
| Monthly (every calendar month) | Security checks | Security owner (server maintainer) | Release captain | Completed monthly security record in `docs/security/evidence/` |
| Quarterly (Q1/Q2/Q3/Q4) | Manual accessibility verification | Accessibility owner (webapp maintainer) | QA coordinator | Completed quarterly cycle artifact in `docs/testing/` |

## 2) Roles and ownership

### Security owner (monthly)
- Runs monthly security checklist and records outcomes.
- Confirms unresolved risks have explicit owners and due dates.
- Escalates HIGH/CRITICAL findings to release captain within 24h.

### Accessibility owner (quarterly)
- Schedules and executes manual verification cycle:
  - keyboard-only navigation,
  - screen reader (at least one desktop + one mobile pass),
  - reduced-motion behavior.
- Captures concrete defects with reproduction steps and severity.
- Ensures caregiver-facing and Amy-facing flows are covered.

### Release captain (cross-cutting)
- Verifies monthly and quarterly artifacts exist before release sign-off.
- Blocks release if governance evidence is missing.

## 3) Monthly security cadence (required every month)

1. Re-run targeted auth/profile authorization checks.
2. Re-run dependency/security scans used in current CI pipeline.
3. Re-validate secret/configuration hygiene for deploy environments.
4. Review open security issues and update owner + ETA.
5. Publish one artifact file in `docs/security/evidence/`.

### Security evidence template

Use this template in each monthly artifact:

```md
# Security Monthly Record — YYYY-MM

- Date: YYYY-MM-DD
- Security owner:
- Backup owner:
- Scope/commit:

## Checks
- [ ] Auth/profile authorization regression checks
- [ ] Dependency/security scan review
- [ ] Secret/config hygiene review
- [ ] Open finding owner+ETA review

## Findings
| Severity | Finding | Owner | ETA | Status |
| --- | --- | --- | --- | --- |

## Release impact
- Ready / Blocked
- Required follow-up:
```

## 4) Quarterly accessibility cadence (required every quarter)

1. Run manual cycle for keyboard, screen reader, and reduced motion.
2. Cover core communication path (recognition, feedback, fallback messaging).
3. Verify no false-success UI states in auth/profile error flows.
4. Capture findings + remediation plan in a dated artifact file in `docs/testing/`.
5. Link resolved defects back to relevant PRs/issues.

### Accessibility evidence template

Use this template in each quarterly artifact:

```md
# Accessibility Verification Cycle — YYYY-QN

- Date(s):
- Accessibility owner:
- Backup owner:
- Build/commit:

## Coverage matrix
| Area | Keyboard | Screen reader | Reduced motion | Result |
| --- | --- | --- | --- | --- |

## Findings
| Severity | Scenario | Repro steps | Owner | Status |
| --- | --- | --- | --- | --- |

## Amy impact
- Communication continuity risk:
- Confusion risk:
- Mitigation:

## Sign-off
- Accessibility owner:
- Release captain:
```

## 5) Quality gate

Release readiness requires:
- At least one monthly security record for the current release month.
- Most recent quarterly accessibility cycle artifact completed and linked in release readiness docs.
- Explicit owner and ETA for every unresolved HIGH/CRITICAL finding.
