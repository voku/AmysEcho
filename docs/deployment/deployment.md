# Deployment Guide

This document describes how to deploy Amy's Echo.

## Components

Amy's Echo consists of two main components:

1. **Webapp** (Browser-based UI) - Deployed to static hosting (GitHub Pages, Netlify, etc.)
2. **Server** (Node.js/Python backend) - Deployed to your own infrastructure

📘 **For server deployment**, see **[SERVER_deployment.md](SERVER_deployment.md)** for comprehensive step-by-step instructions including Docker, systemd, nginx, SSL, and monitoring setup.

---

# Webapp Deployment Guide

This section describes how to deploy Amy's Echo webapp to GitHub Pages or other hosting platforms.

## GitHub Pages Deployment

### Automatic Deployment

The webapp is automatically deployed to GitHub Pages when:
- Changes are pushed to the `main` branch in the `webapp/` directory
- The deployment workflow is manually triggered

**Live URL:** https://voku.github.io/AmysEcho/

**Default API for the live app:** https://amysecho.moelleken.org (override with `VITE_API_URL` for other servers).

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

Configure the API endpoint in the webapp's settings or via environment variable. The GitHub Pages deployment defaults to `https://amysecho.moelleken.org`.
```
VITE_API_URL=https://your-server.com
```

For local development, set `VITE_API_URL=http://localhost:5000` to target a locally running backend.

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

### Login Screen Appears After Reload (GitHub Pages)

**Problem:** After reloading the page on GitHub Pages, the login screen appears even though you were authenticated.

**Causes & Solutions:**

1. **localStorage version mismatch** (Most common)
   - The app uses a versioning system for localStorage to ensure compatibility
   - When deploying a new version, old localStorage data is automatically cleared
   - **Solution:** This is working as intended. Simply log in again. Your credentials will be saved if you enabled "Remember me"

2. **Wrong API URL stored**
   - Old development URL (`http://localhost:5000`) may be cached in localStorage
   - **Solution:** Clear browser localStorage manually or wait for automatic migration
   ```javascript
   // Open browser console and run:
   localStorage.clear();
   location.reload();
   ```

3. **Environment variable not set**
   - Ensure `VITE_API_URL` is set in the GitHub Actions workflow
   - Check `.github/workflows/deploy-webapp.yml` has: `VITE_API_URL: https://amysecho.moelleken.org`
   - **Solution:** Update workflow file and redeploy

4. **Tokens expired**
   - Access tokens have a limited lifetime
   - **Solution:** Log in again. If using refresh tokens, they should automatically refresh

### LocalStorage Schema Version

The webapp uses a versioning system for localStorage (current version: `2`) to ensure clean state across deployments:

- **Key:** `webapp:api-config:version`
- **Behavior:** When version changes, all API configuration storage is cleared
- **Impact:** Users will need to log in again after updates that change the schema version
- **Benefits:** Prevents bugs from incompatible localStorage data; ensures production environment uses correct API URL

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

### API Configuration Best Practices

**For Development:**
- Set `VITE_API_URL=http://localhost:5000` in `.env.local`
- Do NOT commit `.env.local` to git
- API URL defaults to localhost:5000 when not set

**For Production (GitHub Pages):**
- Set `VITE_API_URL` in GitHub Actions workflow (already configured)
- Set `VITE_BASE_PATH=/AmysEcho/` for repository deployment
- Environment variables are baked into the build, not runtime

**For Production (Custom Domain):**
- Set `VITE_API_URL` to your backend server URL
- Set `VITE_BASE_PATH=/` for root deployment
- Consider using same domain for API and webapp to avoid CORS
