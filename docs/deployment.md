<!-- Generated: 2026-02-04 21:00:00 UTC -->

# Deployment Overview

Amy's Echo consists of two deployable components: a static **webapp** and a Node.js/Python **server**. This document provides a quick reference for packaging and distribution.

---

## Package Types

### Webapp Build

| Target | Output | Description |
|--------|--------|-------------|
| Static bundle | `webapp/dist/` | Vite production build (HTML, JS, CSS, assets) |

**Build command:**
```bash
npm run build --prefix webapp
```

**Environment configuration:**
- `VITE_BASE_PATH` — URL path prefix (default: `/AmysEcho/`)
- `VITE_API_URL` — Backend API endpoint

### Server Build

| Target | Output | Description |
|--------|--------|-------------|
| Node.js bundle | `server/dist/` | Compiled TypeScript (server.js entry point) |
| Docker image | — | Built from `server/Dockerfile` |

**Build command:**
```bash
npm run build --prefix server
```

**Required environment variables:**
- `JWT_SECRET` — JWT signing secret (32+ chars)
- `JWT_REFRESH_SECRET` — Refresh token secret (32+ chars)
- `PORT` — Server port (default: `5000`)

---

## Platform Deployment

### Webapp Platforms

| Platform | Configuration |
|----------|---------------|
| **GitHub Pages** | Automatic via workflow; set `VITE_BASE_PATH=/AmysEcho/` |
| **Netlify** | Build: `cd webapp && npm ci && npm run build`; Publish: `webapp/dist` |
| **Vercel** | Root: `webapp`; Framework: Vite |
| **Docker** | Use nginx to serve `webapp/dist/` |
| **Custom static host** | Upload `webapp/dist/` contents |

### Server Platforms

| Platform | Configuration |
|----------|---------------|
| **Docker Compose** | Use `docker-compose.yml` in repo root |
| **Docker standalone** | Build with `server/Dockerfile` |
| **systemd** | Manual setup; see SERVER_DEPLOYMENT.md |
| **ISPConfig + nginx** | Reverse proxy to Node.js; see SERVER_DEPLOYMENT.md |

---

## Reference

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/server-start.sh` | Start production server |
| `scripts/full-check.sh` | Run all linting, type-checking, and tests |

### Data Locations

| Data | Path |
|------|------|
| Global model | `server/data/models/global/amy_model.npz` |
| User uploads | `server/data/uploads/<profileId>/` |
| Training manifest | `server/data/datasets/training_manifest.json` |
| User database | `server/db.json` |

### Configuration Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Docker Compose orchestration |
| `server/Dockerfile` | Server container definition |
| `server/.env` | Server environment variables |
| `webapp/vite.config.ts` | Webapp build configuration |

### Detailed Documentation

- [DEPLOYMENT.md](deployment/DEPLOYMENT.md) — Webapp deployment guide (GitHub Pages, Netlify, Vercel, Docker)
- [SERVER_DEPLOYMENT.md](deployment/SERVER_DEPLOYMENT.md) — Comprehensive server deployment (Docker, systemd, nginx, SSL, monitoring)
- [QUICKSTART_SERVER.md](deployment/QUICKSTART_SERVER.md) — 5-minute Docker deployment guide

---

**Built for Amy** ❤️
