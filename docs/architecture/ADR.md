# Architecture Decision Records (ADR)

This document captures key architectural decisions made for Amy's Echo, including context, rationale, and implications.

## ADR-001: Hybrid-First Architecture

**Date:** 2024-11-15  
**Status:** Implemented  
**Decision Makers:** Core Team

### Context
Amy needs a communication system that works **always**, regardless of network conditions or device capabilities.

### Decision
Implement a hybrid-first architecture where:
- Gesture recognition runs on-device using downloaded MLP weights
- Server handles training and model distribution
- All critical communication paths work offline

### Rationale
- **Zero interruption**: Amy's communication never pauses for network requests
- **Reliability**: Critical gestures (e.g., "hilfe") must work even when offline
- **Performance**: On-device inference is faster than network round-trips (<50ms vs 200-500ms)
- **Privacy**: Gesture data stays on device during recognition

### Consequences
- ✅ Communication works offline
- ✅ Fast gesture recognition (<50ms for critical gestures)
- ✅ Privacy-preserving by default
- ⚠️ Model size must be kept small for download/storage
- ⚠️ Training requires server connectivity

### Alternatives Considered
- **Cloud-only**: Rejected due to latency and offline requirements
- **Fully local training**: Rejected due to computational constraints on devices

---

## ADR-002: JWT-Based Authentication

**Date:** 2025-01-10  
**Status:** Implemented  
**Decision Makers:** Security Team

### Context
Need secure authentication for caregiver accounts accessing child profiles and training data.

### Decision
Use JWT (JSON Web Tokens) with access/refresh token pattern:
- Access tokens: Short-lived (15 minutes)
- Refresh tokens: Long-lived (7 days)
- Both stored securely on client

### Rationale
- **Stateless**: Server doesn't need to maintain session state
- **Scalable**: Easy to distribute across multiple server instances
- **Secure**: Token expiration limits impact of token theft
- **Standard**: Well-understood pattern with good library support

### Consequences
- ✅ Stateless authentication scales horizontally
- ✅ Standard security pattern reduces risk of implementation errors
- ⚠️ Token revocation requires additional infrastructure
- ⚠️ Client must handle token refresh logic

### Implementation Notes
- Access tokens contain: user ID, username, role
- Refresh tokens are single-use (rotated on refresh)
- Email verification required before full access

---

## ADR-003: MLP for Gesture Recognition

**Date:** 2024-10-20  
**Status:** Implemented  
**Decision Makers:** ML Team

### Context
Need a gesture recognition model that:
- Runs on-device with limited resources
- Trains quickly with limited samples
- Achieves >85% accuracy for DGS gestures

### Decision
Use Multi-Layer Perceptron (MLP) trained on MediaPipe landmarks:
- Input: 48,870-48,883 features (hand + pose + face landmarks + audio MFCCs)
- Hidden layers: 256 → 128 → 64 neurons
- Output: Softmax over gesture classes
- Format: NumPy NPZ for easy loading

### Rationale
- **Fast training**: MLP trains in seconds, not hours
- **Small size**: Models are <5MB, suitable for mobile download
- **Good accuracy**: Achieves 85-95% accuracy on DGS gestures
- **Interpretable**: Easy to debug and understand predictions
- **Browser-compatible**: Can be loaded and run in JavaScript

### Consequences
- ✅ Fast training enables personalized models per child
- ✅ Small model size enables offline distribution
- ✅ Good accuracy for Amy's needs
- ⚠️ May not capture complex temporal patterns (vs LSTM/Transformer)
- ⚠️ Requires manual feature engineering from landmarks

### Alternatives Considered
- **CNN/LSTM**: Rejected due to training time and model size
- **Transformer**: Rejected due to computational requirements
- **TensorFlow Lite**: Rejected due to complexity of on-device inference

---

## ADR-004: MediaPipe for Landmark Extraction

**Date:** 2024-09-15  
**Status:** Implemented  
**Decision Makers:** ML Team

### Context
Need reliable hand, pose, and face tracking for gesture recognition.

### Decision
Use Google MediaPipe Holistic for landmark extraction:
- 21 landmarks per hand (42 total)
- 33 pose landmarks
- 468 face landmarks
- Runs in browser via WebAssembly

### Rationale
- **Proven accuracy**: Google's production-grade solution
- **Browser support**: Runs via WebAssembly with no server needed
- **Fast inference**: ~30-60 FPS on modern devices
- **Open source**: Apache 2.0 license
- **Multi-modal**: Captures hands, pose, and face in single pass

### Consequences
- ✅ Reliable landmark extraction without custom ML pipeline
- ✅ Browser-based means no app installation required
- ✅ Multi-modal input improves gesture recognition
- ⚠️ Large WASM binary (~30MB) requires CDN or caching
- ⚠️ Tied to Google's MediaPipe roadmap

### Implementation Notes
- Landmarks normalized to [0,1] range relative to image size
- Visibility and confidence scores included
- Smoothing applied to reduce jitter

---

## ADR-005: IndexedDB for Offline Storage

**Date:** 2024-12-01  
**Status:** Implemented  
**Decision Makers:** Frontend Team

### Context
Need reliable offline storage for:
- Recorded gesture samples awaiting upload
- Downloaded MLP models
- User preferences and settings

### Decision
Use IndexedDB via OPFS (Origin Private File System):
- Training samples stored in structured format
- Models cached for offline use
- Automatic sync when connection restored

### Rationale
- **Large capacity**: Gigabytes of storage available
- **Asynchronous**: Non-blocking I/O
- **Structured**: Query and index capabilities
- **Standard**: Supported in all modern browsers
- **Persistent**: Data survives page reloads

### Consequences
- ✅ Samples can be recorded offline and synced later
- ✅ Models cached for offline gesture recognition
- ⚠️ More complex than localStorage
- ⚠️ Requires polyfill for Safari compatibility

### Alternatives Considered
- **localStorage**: Rejected due to 5-10MB limit
- **Cache API**: Rejected due to lack of structured querying
- **WebSQL**: Deprecated, not considered

---

## ADR-006: JSON File Database for Server

**Date:** 2024-11-01  
**Status:** Implemented  
**Decision Makers:** Backend Team  
**Last Updated:** 2026-02-04 (Added production considerations)

### Context
Need simple, deployable data storage for development and small deployments. The system must support profile management, training samples, and corrections with reasonable concurrency for a small user base.

### Decision
Use JSON file-based database with file locking:
- `db.json` for corrections and samples
- `profile_registry.json` for user profiles
- Atomic writes with file locking
- Optional migration to SQLite/PostgreSQL later

### Rationale
- **Simple deployment**: No database server required
- **Git-friendly**: Changes visible in version control
- **Easy debugging**: Human-readable JSON format
- **Low complexity**: Suitable for development and small-scale deployments
- **Migration path**: Can migrate to SQL later without API changes

### Consequences
- ✅ Zero-config deployment (works on any Node.js host)
- ✅ Easy to debug and inspect
- ✅ Version control friendly
- ✅ Appropriate for development and small-scale production (single server, <10 concurrent users)
- ⚠️ **File locking overhead on concurrent writes** - Can become bottleneck under load
- ⚠️ **Not suitable for production at scale** - Concurrent write performance degrades significantly
- ⚠️ **Data integrity risk** - While file locking provides atomicity, race conditions can occur if locking is not properly implemented across all I/O operations
- ⚠️ **Manual backup/restore procedures**
- ⚠️ **No ACID guarantees** - Unlike SQL databases, file-based storage lacks transaction support

### Production Considerations (Added 2026-02-04)

**For production deployments expecting more than occasional concurrent writes, SQLite is strongly recommended instead:**

**Why SQLite is better for production:**
- ✅ **ACID compliance**: True transaction support with rollback capability
- ✅ **Battle-tested**: Used by billions of applications worldwide
- ✅ **Better concurrency**: WAL mode supports concurrent readers and writers
- ✅ **Same simplicity**: Still a single file, no server needed
- ✅ **Data integrity**: Robust corruption recovery mechanisms
- ✅ **Performance**: Significantly faster than JSON parsing for large datasets
- ⚠️ Slightly more complex deployment (but minimal)

**When JSON files are acceptable:**
- Development environments
- Single-user deployments
- Read-heavy workloads with rare writes
- Prototypes and proof-of-concepts
- Systems with external write serialization (e.g., single-threaded queue)

**When to migrate to SQLite:**
- Multiple concurrent users writing data
- Production deployments requiring reliability
- Workloads with frequent writes (>10 writes/minute)
- Systems requiring transaction support or rollback capability
- Any scenario where data integrity is critical

### Migration Path
When scale demands it:
1. Implement database abstraction layer (`DatabaseAdapter` interface)
2. Add SQLite adapter implementing the same interface
3. Create migration script to import JSON data into SQLite
4. Deploy with zero-downtime: dual-write mode → cutover → retire JSON files
5. No API changes required (abstraction layer maintains compatibility)

### Implementation Notes
The current implementation uses file locking via the `withFileLock` utility. All write operations must use this utility to prevent corruption. However, this is not a substitute for proper database transactions and should be considered a development convenience rather than a production-grade solution.

---

## ADR-007: German-First UI and Messages

**Date:** 2024-08-01  
**Status:** Implemented  
**Decision Makers:** Product Team

### Context
Amy communicates in German (DGS). Her caregivers speak German. The app must feel natural in their language.

### Decision
All user-facing text, error messages, and feedback in German:
- UI labels and buttons
- Error messages and validation
- Caregiver feedback and prompts
- API error responses

English retained for:
- Developer logs and debugging
- Internal code comments
- Technical documentation
- Variable/function names

### Rationale
- **Amy First**: App serves German-speaking users
- **Clarity**: Error messages must be understood by caregivers
- **Trust**: Professional German UX builds confidence
- **Accessibility**: Reduces cognitive load for primary users

### Consequences
- ✅ Natural user experience for German speakers
- ✅ Error messages are immediately understandable
- ⚠️ Requires German-speaking reviewers for PRs
- ⚠️ Translation needed if internationalized later

### Implementation Notes
- Use proper German formal/informal address ("du" vs "Sie") - currently using "du"
- German keyboard layout considerations
- Date/time formatting follows German conventions

---

## ADR-008: Multimodal Input (Visual + Audio)

**Date:** 2025-12-15  
**Status:** Implemented  
**Decision Makers:** ML Team

### Context
Amy sometimes vocalizes while signing (e.g., "Iila" for purple). Combining audio and visual improves accuracy.

### Decision
Support multimodal input by combining:
- Visual features: Hand/pose/face landmarks (48,870 dims)
- Audio features: MFCC coefficients (13 dims)
- Fusion: Concatenate features before MLP input (48,883 dims)
- Graceful degradation: Zero-padding when audio missing

### Rationale
- **Higher accuracy**: Multimodal fusion improves recognition by 5-10%
- **Natural for Amy**: Captures how she actually communicates
- **Backward compatible**: Visual-only mode still works
- **Privacy-preserving**: Audio processed on-device

### Consequences
- ✅ Better recognition when Amy vocalizes
- ✅ Captures more natural communication patterns
- ✅ Backward compatible with visual-only samples
- ⚠️ Increased model input dimension (13 features)
- ⚠️ Requires microphone permission

### Implementation Notes
- Audio capture: 16kHz mono, 1-second windows
- MFCC extraction: Web Audio API (browser-based)
- Training: Automatic detection of audio presence
- Inference: Real-time MFCC extraction during recognition

---

## ADR-009: Rate Limiting Strategy

**Date:** 2025-02-01  
**Status:** Implemented  
**Decision Makers:** Security Team

### Context
Need to protect server from abuse while allowing legitimate caregiver workflows.

### Decision
Implement tiered rate limiting:
- General API: 120 requests/minute per IP
- Model metadata: 10 requests/minute (prevents hammering)
- Training: 5 requests/minute (expensive operations)
- Health check: 100 requests/second (monitoring tolerance)

### Rationale
- **DoS protection**: Prevents single user from overwhelming server
- **Fair usage**: Ensures all users get responsive service
- **Cost control**: Training operations are expensive
- **Monitoring friendly**: Health checks excluded from strict limits

### Consequences
- ✅ Protected against DoS attacks
- ✅ Prevents accidental overuse
- ✅ Clear error messages when limits exceeded
- ⚠️ May need user-based limits for multi-device setups
- ⚠️ Monitoring may need higher health check limit

### Future Enhancements
- Per-user rate limiting (not just IP-based)
- Configurable limits per endpoint
- Rate limit exemptions for specific users

---

## ADR-010: CodeQL for Static Security Analysis

**Date:** 2026-02-04  
**Status:** Implemented  
**Decision Makers:** Security Team

### Context
Need automated security vulnerability detection in TypeScript and Python code.

### Decision
Use GitHub CodeQL scanning:
- Weekly scheduled scans
- PR-triggered scans
- Security-extended query suite
- JavaScript and Python analysis

### Rationale
- **Proactive security**: Find vulnerabilities before deployment
- **Industry standard**: Used by GitHub and major projects
- **Low friction**: Integrates with GitHub workflow
- **Comprehensive**: Covers common CVEs and OWASP Top 10

### Consequences
- ✅ Automated vulnerability detection
- ✅ PR blocking for high-severity issues
- ✅ Weekly monitoring for new vulnerabilities
- ⚠️ May produce false positives requiring triage
- ⚠️ Adds ~5-10 minutes to CI pipeline

### Implementation Notes
- Runs on push to main and all PRs
- Weekly scheduled scan on Mondays
- Results visible in Security tab
- Blocking CI check for high-severity findings

---

## Record Template

Use this template for new ADRs:

```markdown
## ADR-XXX: [Title]

**Date:** YYYY-MM-DD  
**Status:** [Proposed | Implemented | Deprecated | Superseded by ADR-YYY]  
**Decision Makers:** [Team/Individual]

### Context
[What is the issue we're facing? What constraints exist?]

### Decision
[What did we decide to do?]

### Rationale
[Why did we make this decision? What alternatives did we consider?]

### Consequences
[What are the positive and negative effects of this decision?]

### Alternatives Considered
[What other options did we evaluate and why were they rejected?]

### Implementation Notes
[Any specific details about how this was implemented]
```

---

**Last Updated:** 2026-02-04
