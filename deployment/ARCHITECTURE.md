# Amy's Echo Server - Deployment Architecture

This document visualizes the server deployment architecture and data flow.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTPS (443)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      nginx Reverse Proxy                        │
│  • SSL/TLS Termination                                          │
│  • HTTP → HTTPS Redirect                                        │
│  • Security Headers                                             │
│  • Request Proxying                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP (localhost:5000)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Amy's Echo Server                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Node.js/Express Application                 │   │
│  │  • REST API endpoints                                    │   │
│  │  • Authentication (JWT + Legacy Token)                   │   │
│  │  • Rate limiting                                         │   │
│  │  • Request validation                                    │   │
│  └────────────┬─────────────────────────────┬───────────────┘   │
│               │                             │                   │
│               │                             │                   │
│  ┌────────────▼──────────────┐  ┌───────────▼──────────────┐   │
│  │   Python ML Pipeline      │  │   Data Storage           │   │
│  │  • MediaPipe processing   │  │  • db.json (users)       │   │
│  │  • MLP model training     │  │  • dgs_samples.json      │   │
│  │  • Model artifact (.npz)  │  │  • training bundles      │   │
│  └───────────────────────────┘  │  • trained models (.npz) │   │
│                                  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow

### 1. Gesture Sample Upload

```
Webapp → HTTPS → nginx → Server API → Validation → Storage
                                          ↓
                                    db.json updated
                                    Bundle stored
```

### 2. Model Training

```
Upload Complete → Training Queue → Python Script
                                       ↓
                              MediaPipe Processing
                                       ↓
                                  MLP Training
                                       ↓
                              Save Model (.npz)
                                       ↓
                            Global + Per-Profile
```

### 3. Model Download

```
Webapp → HTTPS → nginx → Server API → Auth Check
                                          ↓
                                   Profile Lookup
                                          ↓
                            Send Personalized Model
                                    or Global
```

## 📁 File System Layout

```
/opt/amysecho/app/
├── server/
│   ├── dist/                    # Compiled TypeScript
│   │   └── server.js           # Main entry point
│   ├── data/                    # Persistent data
│   │   ├── dgs_samples.json    # Training samples
│   │   ├── models/             # Trained models
│   │   │   ├── global/
│   │   │   │   └── amy_model.npz
│   │   │   └── [profile-id]/
│   │   │       └── amy_model.npz
│   │   └── uploads/            # Training bundles
│   │       └── [profile-id]/
│   │           └── [timestamp]/
│   │               ├── metadata.json
│   │               ├── landmarks.json
│   │               └── still.jpg
│   ├── db.json                 # User database
│   └── .env                    # Configuration
├── deployment/
│   ├── scripts/
│   │   ├── backup.sh
│   │   └── monitor.sh
│   └── ...
└── logs/                       # Application logs
```

## 🐳 Docker Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Host System                       │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          amysecho-server Container                    │  │
│  │                                                        │  │
│  │  ┌────────────────────────────────────────────────┐   │  │
│  │  │       Node.js + Python Environment            │   │  │
│  │  │  • Node 20                                     │   │  │
│  │  │  • Python 3.x                                  │   │  │
│  │  │  • MediaPipe, NumPy, etc.                      │   │  │
│  │  └────────────────────────────────────────────────┘   │  │
│  │                                                        │  │
│  │  Exposed: Port 5000                                    │  │
│  │                                                        │  │
│  └─────────┬──────────────────────────────┬──────────────┘  │
│            │                              │                 │
│    ┌───────▼────────┐            ┌────────▼──────────┐      │
│    │  Volume Mount  │            │   Volume Mount    │      │
│    │  ./server/data │            │ ./server/db.json  │      │
│    │  → /app/data   │            │  → /app/db.json   │      │
│    └────────────────┘            └───────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
        ↑                                      ↑
        │                                      │
    Persists across container restarts   Persists across
                                         container restarts
```

## 🔐 Security Layers

```
┌────────────────────────────────────────────────────────────┐
│ Layer 1: Network                                           │
│  • Firewall (UFW/iptables)                                 │
│  • Only ports 22, 80, 443 exposed                          │
│  • Application port (5000) blocked from outside            │
└────────────────────────────────────────────────────────────┘
                             ↓
┌────────────────────────────────────────────────────────────┐
│ Layer 2: SSL/TLS                                           │
│  • HTTPS only (HTTP redirects)                             │
│  • TLS 1.2+ with strong ciphers                            │
│  • Valid certificate (Let's Encrypt)                       │
│  • HSTS, security headers                                  │
└────────────────────────────────────────────────────────────┘
                             ↓
┌────────────────────────────────────────────────────────────┐
│ Layer 3: Application                                       │
│  • JWT authentication                                      │
│  • Rate limiting (120 req/min)                             │
│  • Input validation (Zod schemas)                          │
│  • Path traversal protection                               │
└────────────────────────────────────────────────────────────┘
                             ↓
┌────────────────────────────────────────────────────────────┐
│ Layer 4: File System                                       │
│  • Restricted permissions (600/750)                        │
│  • Dedicated user (amysecho)                               │
│  • No root privileges                                      │
└────────────────────────────────────────────────────────────┘
```

## ⚡ Request Flow Examples

### Health Check (No Auth)
```
GET /health
  → nginx (pass-through, no logging)
  → Express handler
  → Response: {status: "ok", uptime: 123, pendingTrainingJobs: 0}
```

### Upload Sample (Authenticated)
```
POST /api/v1/dgs/samples
Headers: Authorization: Bearer <token>
Body: {label: "faust", profileId: "amy", landmarks: [...]}
  → nginx (SSL termination)
  → Express (auth middleware)
  → Rate limiter check
  → Validation (Zod)
  → File lock (dgs_samples.json)
  → Append sample
  → Response: {status: "ok"}
```

### Train Model (Authenticated)
```
POST /train-model
Headers: Authorization: Bearer <token>
Body: {samples: [...], trigger: "bundles"}
  → nginx
  → Express (auth middleware)
  → Validation
  → Queue training job
  → Spawn Python process
    → Load samples
    → Train MLP
    → Save model (.npz)
    → Return metrics
  → Response: {status: "running", jobId: "...", pollUrl: "..."}
```

### Download Model (Authenticated)
```
GET /latest-mlp-model?profileId=amy
Headers: Authorization: Bearer <token>
  → nginx
  → Express (auth middleware)
  → Profile authorization check
  → Path containment validation
  → Check if personalized model exists
    → Yes: Send profile-specific model
    → No: Send global model
  → Response: Binary .npz file
```

## 🔄 High Availability Setup (Optional)

For production deployments requiring high availability:

```
                     ┌─────────────┐
                     │   DNS/CDN   │
                     └──────┬──────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
         ┌────▼─────┐              ┌─────▼────┐
         │ Server 1 │              │ Server 2 │
         │ (Primary)│              │ (Standby)│
         └────┬─────┘              └─────┬────┘
              │                          │
         ┌────▼──────────────────────────▼────┐
         │    Shared Storage (NFS/GlusterFS)  │
         │    • Training data                 │
         │    • Models                        │
         │    • Database (with locking)       │
         └────────────────────────────────────┘
```

**Note:** The current implementation uses file-based locking and is not designed for multi-server deployment. Shared storage setup requires additional coordination mechanisms.

## 📊 Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Server                                 │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │   Health   │  │  Application │  │  Training Debug    │   │
│  │  Endpoint  │  │     Logs     │  │       Log          │   │
│  │  /health   │  │  (journald)  │  │ training-debug.log │   │
│  └─────┬──────┘  └──────┬───────┘  └─────────┬──────────┘   │
└────────┼────────────────┼──────────────────────┼─────────────┘
         │                │                      │
         │                │                      │
    ┌────▼────┐      ┌────▼────┐          ┌─────▼─────┐
    │ monitor │      │   Log   │          │   Manual  │
    │  .sh    │      │ Rotation│          │   Review  │
    │ (cron)  │      │ (system)│          └───────────┘
    └────┬────┘      └─────────┘
         │
         ▼
    ┌─────────┐
    │  Email  │
    │  Alert  │
    └─────────┘
```

## 💾 Backup Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                      Daily Schedule                          │
│                       (2 AM cron)                            │
└─────────────────────────┬────────────────────────────────────┘
                          │
                    ┌─────▼──────┐
                    │ backup.sh  │
                    └─────┬──────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    ┌────▼────┐      ┌────▼────┐     ┌────▼────┐
    │  data/  │      │db.json  │     │ Compress│
    │ directory│     │  file   │     │  (tar)  │
    └─────────┘      └─────────┘     └────┬────┘
                                           │
                                      ┌────▼────────────┐
                                      │  /var/backups/  │
                                      │   amysecho/     │
                                      │ backup_DATE.tgz │
                                      └────┬────────────┘
                                           │
                                   ┌───────▼──────────┐
                                   │ Delete old       │
                                   │ (>7 days)        │
                                   └──────────────────┘
```

## 🚀 Scaling Considerations

### Vertical Scaling (Single Server)
- ✅ **Easy**: Increase CPU/RAM
- ✅ **No code changes**: Works immediately
- ✅ **Recommended**: For most use cases

### Horizontal Scaling (Multiple Servers)
- ⚠️ **Complex**: Requires coordination
- ❌ **Not supported**: File-based database and locking
- 📝 **Future**: Would need distributed database (PostgreSQL, Redis)

### Current Capacity (Recommended Specs)
- **Concurrent users**: ~50
- **API requests**: 120/min per IP (configurable)
- **Training jobs**: 1 at a time (queued)
- **Storage**: ~100MB per 1000 samples

---

For deployment instructions, see:
- **Quick Start**: [QUICKSTART_SERVER.md](../QUICKSTART_SERVER.md)
- **Complete Guide**: [docs/SERVER_DEPLOYMENT.md](../docs/SERVER_DEPLOYMENT.md)
- **Checklist**: [deployment/DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
