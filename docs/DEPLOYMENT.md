# Deployment Guide

This document describes how to deploy Amy's Echo.

## Components

Amy's Echo consists of two main components:

1. **Webapp** (Browser-based UI) - Deployed to static hosting (GitHub Pages, Netlify, etc.)
2. **Server** (Node.js/Python backend) - Deployed to your own infrastructure

📘 **For server deployment**, see **[SERVER_DEPLOYMENT.md](SERVER_DEPLOYMENT.md)** for comprehensive step-by-step instructions including Docker, systemd, nginx, SSL, and monitoring setup.

---

# Webapp Deployment Guide

This section describes how to deploy Amy's Echo webapp to GitHub Pages or other hosting platforms.

## GitHub Pages Deployment

### Automatic Deployment

The webapp is automatically deployed to GitHub Pages when:
- Changes are pushed to the `main` branch in the `webapp/` directory
- The deployment workflow is manually triggered

**Live URL:** https://voku.github.io/AmysEcho/

### Setup Requirements

1. **Enable GitHub Pages** in repository settings:
   - Go to Settings → Pages
   - Source: "GitHub Actions"

2. **Repository Permissions** (already configured in workflow):
   - `contents: read`
   - `pages: write`
   - `id-token: write`

### Manual Deployment

To trigger a manual deployment:
1. Go to Actions → "Deploy Webapp to GitHub Pages"
2. Click "Run workflow"
3. Select branch and run

### Build Configuration

The webapp uses Vite with the following deployment settings in `vite.config.ts`:

```typescript
base: process.env.VITE_BASE_PATH || '/AmysEcho/',
```

For local development, the base path defaults to `/AmysEcho/`. For custom domains, set `VITE_BASE_PATH=/`.

## Local Development

```bash
cd webapp
npm install
npm run dev
```

The app will be available at http://localhost:5173/AmysEcho/

## Alternative Deployment Options

### Netlify

1. Connect your GitHub repository
2. Build command: `cd webapp && npm ci && npm run build`
3. Publish directory: `webapp/dist`
4. Environment variable: `VITE_BASE_PATH=/`

### Vercel

1. Import your GitHub repository
2. Framework preset: Vite
3. Root directory: `webapp`
4. Environment variable: `VITE_BASE_PATH=/`

### Docker

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY webapp/package*.json ./
RUN npm ci
COPY webapp/ ./
ENV VITE_BASE_PATH=/
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:
```bash
docker build -t amys-echo .
docker run -p 8080:80 amys-echo
```

## API Configuration

The webapp connects to the backend server for:
- Gesture recognition model updates
- Training data upload
- Profile sync

Configure the API endpoint in the webapp's settings or via environment variable:
```
VITE_API_URL=https://your-server.com
```

## Browser Requirements

- Modern browser with WebRTC support (camera access)
- MediaPipe hands model compatibility
- IndexedDB for offline storage

Tested browsers:
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 15+
- ✅ Edge 90+

## Performance Considerations

- Initial load: ~500KB (gzipped)
- MediaPipe model: ~3MB (cached)
- Offline-capable via service worker (planned)

## Troubleshooting

### Build Fails
```bash
cd webapp
npm run type-check  # Check for TypeScript errors
npm run lint        # Check for ESLint warnings
npm test            # Run tests
```

### Camera Not Working
- Ensure HTTPS (required for camera access)
- Check browser permissions
- Test: https://voku.github.io/AmysEcho/

### Routing Issues (404 on refresh)
For SPA routing on GitHub Pages, the app includes a 404.html redirect script (if needed).

For other hosts, configure the server to serve index.html for all routes:
- Netlify: Add `_redirects` file with `/* /index.html 200`
- Nginx: `try_files $uri $uri/ /index.html;`
