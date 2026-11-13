# Amy's Echo NG — S0a product and data contract v0.1 (draft)

**Owner of product outcome:** [#1176](https://github.com/voku/AmysEcho/issues/1176). **Acceptance issue:** [#1178](https://github.com/voku/AmysEcho/issues/1178).  
**Status:** Proposed for caregiver review; **not approved, tested, or 1.0-ready**. This document makes no claim about any child's abilities, preferences, or recorded gestures.

## 1. Scope and outcome

Amy's Echo NG is a **local-first augmentative and alternative communication (AAC) tool**. The child must be able to intentionally select a communication concept and show its German message **with the camera denied and no network**. Gestures are optional input, never the only route to communicate. A concept is *not* a DGS vocabulary entry or an inferred translation.

The first product proof is **board → concept ID → German visible message + offline-safe visual → speech where a local German voice is actually available**, with an explicit, usable visible fallback otherwise. No ML, capture, backend, sync, or legacy imports are permitted in S0a/S1.

## 2. Public synthetic concept candidates (not approved vocabulary)

All example IDs and texts below are **non-personal placeholders** for deterministic test fixtures. The caregiver must choose and approve 3–5 useful real-world concepts before the child-facing S1 board is accepted.

| Stable concept ID | German label | German output text | Asset policy |
| --- | --- | --- | --- |
| `hilfe` | Hilfe | Ich brauche Hilfe. | Locally rendered placeholder |
| `trinken` | Trinken | Ich möchte etwas trinken. | Locally rendered placeholder |
| `pause` | Pause | Ich brauche eine Pause. | Locally rendered placeholder |
| `mehr` | Mehr | Ich möchte mehr. | Locally rendered placeholder |
| `fertig` | Fertig | Ich bin fertig. | Locally rendered placeholder |

Do not download or commit copyrighted AAC symbols on an assumed MIT license. Each eventual bundled/caregiver-provided asset needs a recorded source, license/permission, offline availability and an accessible fallback. No actual child photos or audio samples belong in the public repository.

## 3. Minimal versioned contracts (design, not implementation)

- **`ConceptV1`**: `{ version: 1, id: string, labelDe: string, speechDe: string, asset?: { localId: string, permissionRef: string } }`. `id` is stable within the product vocabulary and independent of gesture or profile; German strings are never inferred from an unknown gesture. Assets are local and optional; output remains readable without them.
- **`ProfileV1`**: `{ version: 1, id: string, conceptIds: string[] }`. Generate an opaque local identifier; never use names, birth dates or biometric identifiers as IDs. Every setting, sample and optional model artifact must be namespaced by profile. Profile selection must not silently cross-read another profile's state.
- **`FeatureSequenceV1`** (**future S2/S3 only**): require explicit `schemaVersion: 1`, owning `profileId`, time-ordered monotonic timestamps, landmark/hand-presence and quality fields with documented units, feature extraction version and provenance. Reject incompatible versions instead of guessing or silently migrating. **No sequence may be persisted in S0a/S1.** Neither raw video nor a recognition model is needed for this contract.

S1 chooses the smallest browser storage that meets the board/profile/export tests; this contract does **not** preselect an API, server or database.

## 4. Device selection and verification ledger

The first device is a **candidate, not a verified supported platform**. Record actual versions and measurements on a physical device before any capability claim.

| Role | Candidate device/browser | OS/browser versions | Camera and permission behavior | German *offline* TTS | Install / airplane-mode / storage behavior |
| --- | --- | --- | --- | --- | --- |
| Primary child-facing target | Redmi Note 14 Pro; Android Chrome | **Unverified: record on device** | **Unverified; test denied and unavailable** | **Unverified; enumerate local voices and speak with network disabled** | **Unverified; test installed cold start after prior install** |
| Secondary development/compatibility target | Linux desktop; Chromium | **Unverified: choose hardware and record versions** | **Unverified; not a substitute for mobile evidence** | **Unverified; not assumed offline** | **Unverified; not a release claim** |

**Human decision pending:** caregiver confirms primary device, second target and which browser variants are actually supported. Record camera availability, long-session responsiveness, TTS voice name/language/local availability, offline install behavior and storage persistence/eviction observations. A browser reporting a voice as `de-DE` does **not** prove that it operates without a network. Do not set performance, latency or accuracy thresholds without baseline measurements.

## 5. Private, caregiver-observed S1 board-only session protocol

1. **Before the session:** caregiver approves the concept set and a short interaction, verifies a local-only test installation, enables airplane mode, denies camera permission and confirms no backend is reachable. Document voice capability and fallback availability.
2. **Perform 5–10 attempts** across approved concepts; caregiver notes each *intended* message before judging the output. Permit the child to stop, select another concept or ask for help at any time. No pressure to perform or complete all attempts.
3. **Per attempt record privately:** anonymous session ID, attempt ordinal, intended concept ID, selected concept ID, completed intended message (yes/no/unclear), elapsed time to visible output, retries, corrections, caregiver assistance (none/prompt/physical), board fallback used, visual displayed, and offline speech available/succeeded/unavailable. Also record camera/network-disabled state.
4. **Review:** summarize successful intended communications, unclear cases, repetition/correction effort and assistance. Set useful, caregiver-approved acceptance thresholds **after** observing the board-only baseline on the primary device. Do not publish raw per-child results, timestamps tied to a child, videos, audio, landmarks or identifiable screenshots to GitHub/CI.

**Private session sheet template (not to commit with real data):**

`session=<random-local-id> | attempt=<1..10> | intended=<concept-id> | selected=<concept-id> | completed=<yes/no/unclear> | timeMs=<observed> | retries=<count> | corrections=<count> | help=<none/prompt/physical> | boardFallback=<yes/no> | visual=<ok/fail> | offlineVoice=<ok/unavailable/fail> | cameraDenied=<yes/no> | offline=<yes/no>`

There is **no fabricated baseline**, and this template is not evidence of an actual caregiver session.

## 6. Child data ownership, consent and deletion

- A caregiver controls creation, export, restore, deletion and optional future teaching. A child-facing interaction must not expose profile exports or deletion controls accidentally. **Human decision pending:** identify the authorized caregiver and decide local retention/backup policy before storing personal data.
- By default persist **no raw camera video, microphone recordings, landmark sequences, personal gesture labels, cloud telemetry or identifying diagnostics**. S1 can store only the minimum local board/profile preferences. Any future S3 landmark capture requires a separate, explicit caregiver learning action, explanation of retention, and a delete/revoke path; opt-in must not be implied by using the board.
- Any diagnostics are **off by default** and must exclude child-identifying information and biometric/landmark payloads. No real child data in source, public issues, automated test fixtures, Actions logs or uploaded artifacts.
- Profile A and B must have disjoint local records and asset references. A profile deletion must purge its records, locally stored features (if ever allowed), cached/private artifacts and profile-owned settings, then verify absence; preserve other profiles.
- Offer a **caregiver-controlled versioned export → restore → delete** round-trip before S1 acceptance. Reject malformed/incompatible imports without partial state changes. Browser IndexedDB/OPFS may be evicted; no permanence guarantee. Deletion cannot recall previously exported copies, so show that limitation explicitly and let caregivers manage backups independently.
- Retention duration, encryption-at-rest choice, export password/protection and diagnostics consent are **human/security decisions pending**; no unsupported privacy/security promises.

## 7. Stop / go gates and evidence ownership

- **S0a documentation is complete only when** caregiver has reviewed and decided the concept set, actual supported device/browser candidates, privacy ownership/retention and the private session procedure. Keep #1178 open until those decisions are recorded without personal information.
- **S0b #1179** independently proves clean-checkout NG install/build/test/CI and verifies required status-check behavior, without mutating or bypassing legacy security checks. The existing #1181 PR is not proof of a released AAC product.
- **S1 #1180** requires a physical-device board-only session where camera is denied and the network is off, plus offline text/visual output, verified local voice or an explicitly *unmet* speech requirement, profile isolation/export/restore/delete and clean NG CI. A green CI alone is insufficient.
- **S2 camera and S3 personalized gesture matching remain blocked** until S1's real-device communication gate is met. Never substitute classifier accuracy for successful communication or reduce offline requirements to make a test pass.
