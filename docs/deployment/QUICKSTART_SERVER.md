# Amy's Echo Server - Quick Start Guide

This guide gets your Amy's Echo server running in **5 minutes**.

For complete deployment documentation, see **[docs/deployment/SERVER_DEPLOYMENT.md](docs/deployment/SERVER_DEPLOYMENT.md)**.

## Prerequisites

- Linux server with Docker installed
- Domain name pointed to your server (optional, but recommended for HTTPS)
- SSH access to your server

## Deploy with Docker (Recommended)

### Step 1: Clone the Repository

```bash
git clone https://github.com/voku/AmysEcho.git
cd AmysEcho
```

### Step 2: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Generate secure secrets
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)" >> .env
echo "BACKUP_SECRET=$(openssl rand -hex 32)" >> .env

# Edit .env if you need to customize any settings
nano .env
```

### Step 3: Start the Server

```bash
# Build and start the container
docker-compose up -d

# Check if it's running
docker-compose ps

# View logs
docker-compose logs -f amysecho-server
```

### Step 4: Verify It's Working

```bash
# Health check
curl http://localhost:5000/health

# Expected response:
# {"status":"ok","uptime":123.45,"pendingTrainingJobs":0}
```

**🎉 Your server is now running!**

## Next Steps

### Option A: Test Locally

The server is now running at `http://localhost:5000`. You can:

1. Configure the webapp to use this URL:
   ```bash
   cd webapp
   VITE_API_URL=http://localhost:5000 npm run dev
   ```

2. Access the webapp at `http://localhost:5173`

### Option A2: Authenticate against the backend

Use these REST calls to create users and manage sessions while developing locally:

```bash
# Sendmail config (default) for registration/verification emails
export MAIL_TRANSPORT=sendmail
export SENDMAIL_PATH=/usr/sbin/sendmail
export SMTP_FROM=no-reply@amysecho.local
export APP_BASE_URL=http://localhost:5173

# For SMTP instead:
# export MAIL_TRANSPORT=smtp
# export SMTP_HOST=localhost
# export SMTP_PORT=1025
# export SMTP_SECURE=false
# export SMTP_USER=your-user
# export SMTP_PASS=your-pass

# Register a caregiver (stores the user in SQLite, default: `server/db.sqlite`)
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"amy","email":"amy@example.com","password":"super-secure-password"}'

# **Note:** Email verification is required before first login. Check the email inbox for the verification link.

# Confirm the email address before logging in (use the code from the email)
# curl -X POST http://localhost:5000/api/v1/auth/verify-email/confirm \
#   -H 'Content-Type: application/json' \
#   -d '{"email":"amy@example.com","verificationToken":"<code>"}'

# Log in an existing user and get access/refresh tokens
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"amy","password":"super-secure-password"}'

# Refresh tokens (use the refreshToken from the login response)
curl -X POST http://localhost:5000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refresh_token_here>"}'

# Call protected routes with the issued access token
curl -H 'Authorization: Bearer <access_token>' http://localhost:5000/api/v1/symbols
```

### Option B: Setup HTTPS with nginx

For production use, you should setup SSL/TLS:

1. **Install nginx and certbot:**
   ```bash
   sudo apt update
   sudo apt install nginx certbot python3-certbot-nginx
   ```

2. **Update domain in nginx config:**
   ```bash
   # Edit the config file
   sudo nano deployment/nginx/amysecho.conf
   # Replace 'your-domain.com' with your actual domain
   ```

3. **Install nginx config:**
   ```bash
   sudo cp deployment/nginx/amysecho.conf /etc/nginx/sites-available/amysecho
   sudo ln -s /etc/nginx/sites-available/amysecho /etc/nginx/sites-enabled/
   ```

4. **Get SSL certificate:**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

5. **Test and reload:**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

Now your server is accessible at `https://your-domain.com`!

### Option C: Setup Automated Backups

```bash
# Copy backup script
sudo cp deployment/scripts/backup.sh /usr/local/bin/amysecho-backup
sudo chmod +x /usr/local/bin/amysecho-backup

# Schedule daily backups at 2 AM
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/amysecho-backup") | crontab -
```

### Option D: Setup Health Monitoring

```bash
# Copy monitoring script
sudo cp deployment/scripts/monitor.sh /usr/local/bin/amysecho-monitor
sudo chmod +x /usr/local/bin/amysecho-monitor

# Check every 5 minutes
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/amysecho-monitor") | crontab -
```

## Common Commands

```bash
# View logs
docker-compose logs -f amysecho-server

# Restart server
docker-compose restart amysecho-server

# Stop server
docker-compose down

# Update server
git pull
docker-compose down
docker-compose build
docker-compose up -d

# Backup data manually
docker-compose exec amysecho-server tar -czf /tmp/backup.tar.gz /app/data /app/db.sqlite

# Access container shell
docker-compose exec amysecho-server bash
```

## Server Management (SQLite & Accounts)

### Where user data is stored

The server uses SQLite by default (`server/db.sqlite`).
If you use Docker, the DB inside the container is typically `/app/db.sqlite`.

### Re-initialize the SQLite database (development only)

⚠️ This deletes all accounts, profiles, and training-related persisted records.

```bash
# Stop server/container first
# Local (from repo root)
rm -f server/db.sqlite server/db.sqlite-shm server/db.sqlite-wal

# Docker
# docker-compose stop amysecho-server
# docker-compose exec amysecho-server rm -f /app/db.sqlite /app/db.sqlite-shm /app/db.sqlite-wal
# docker-compose start amysecho-server
```

### Show current users

```bash
# Local DB file
python - <<'PY'
import sqlite3
conn = sqlite3.connect('server/db.sqlite')
cur = conn.cursor()
for row in cur.execute('SELECT id, username, email, role, emailVerifiedAt FROM users ORDER BY createdAt DESC'):
    print(row)
PY
```

### Delete an account (safe self-delete with data cleanup)

Preferred path: use the authenticated endpoint (same safety as webapp settings).
A user can delete only their own account after re-authentication.

```bash
# 1) Login and get access token
curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"amy","password":"super-secure-password"}'

# 2) Delete own account (username must match current session user)
curl -X DELETE http://localhost:5000/api/v1/auth/account \
  -H 'Authorization: Bearer <access_token>' \
  -H 'Content-Type: application/json' \
  -d '{"username":"amy","password":"super-secure-password","confirmText":"KONTO LÖSCHEN"}'
```

The backend deletes owned profile data and then the account, and writes audit logs.

### Emergency direct SQL deletion (maintenance only)

Use only if API deletion is impossible (e.g., broken auth stack). Always create a backup first.

```bash
cp server/db.sqlite server/db.sqlite.backup.$(date +%Y%m%d_%H%M%S)

python - <<'PY'
import sqlite3
user_id = 'REPLACE-USER-ID'
conn = sqlite3.connect('server/db.sqlite')
cur = conn.cursor()
profiles = [row[0] for row in cur.execute('SELECT id FROM profiles WHERE userId = ?', (user_id,))]
for profile_id in profiles:
    cur.execute('DELETE FROM profiles WHERE id = ?', (profile_id,))
    cur.execute('DELETE FROM usageStats WHERE profileId = ?', (profile_id,))
    cur.execute('DELETE FROM corrections WHERE profileId = ?', (profile_id,))
    cur.execute('DELETE FROM symbols WHERE profileId = ?', (profile_id,))
cur.execute('DELETE FROM userLabelSettings WHERE userId = ?', (user_id,))
cur.execute('DELETE FROM users WHERE id = ?', (user_id,))
conn.commit()
print('deleted user', user_id)
PY
```

## Troubleshooting

### Server won't start

```bash
# Check logs for errors
docker-compose logs amysecho-server

# Common issues:
# 1. Port 5000 already in use - change PORT in .env
# 2. Missing .env file - copy from .env.example
# 3. Permission issues - check volume permissions
```

### Cannot connect to server

```bash
# Check if container is running
docker-compose ps

# Check if port is accessible
curl http://localhost:5000/health

# Check firewall
sudo ufw status
sudo ufw allow 5000/tcp
```

### Training fails

```bash
# Check training logs inside container
docker-compose exec amysecho-server cat /app/data/training-debug.log

# Check Python dependencies
docker-compose exec amysecho-server pip3 list
```

### Login/refresh fails after changing `JWT_*` values

If you rotate `JWT_SECRET` or `JWT_REFRESH_SECRET`, all previously issued
access and refresh tokens become invalid. This is expected security behavior.

Use this recovery workflow:

```bash
# 1) Verify canonical env names are set in .env
grep -E '^JWT_SECRET=|^JWT_REFRESH_SECRET=' .env

# 2) Restart backend so new secrets are loaded
docker-compose down
docker-compose up -d

# 3) Verify health endpoint is up
curl http://localhost:5000/health
```

Then in the webapp:
- Sign out and sign in again (required after secret rotation).
- If needed, clear browser storage for the site and log in again.

Current behavior:
- The webapp logout button now removes all auth token artifacts from
  `localStorage` and `sessionStorage` (persisted + session token slots), so the
  next login starts from a clean auth state.

Notes:
- Canonical names are `JWT_SECRET` and `JWT_REFRESH_SECRET`.
- Legacy aliases `JWT_ACCESS_SECRET` and `JWT_REFRESH_TOKEN_SECRET` are still
  accepted temporarily with deprecation warnings.
- Check server logs for deprecation warnings if you still use legacy aliases,
  and migrate to canonical names to avoid future breakage.

## Manual Deployment (Without Docker)

If you prefer not to use Docker, see the complete manual deployment instructions in **[docs/deployment/SERVER_DEPLOYMENT.md](docs/deployment/SERVER_DEPLOYMENT.md#manual-deployment-with-systemd)**.

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server port |
| `JWT_SECRET` | **(required, no default)** | JWT signing secret (**must be set**) |
| `JWT_REFRESH_SECRET` | **(required, no default)** | Refresh token secret (**must be set**) |
| `NODE_ENV` | `development` | Environment mode |
| `API_LIMIT` | `120` | Rate limit (requests/minute) |

### Important Files

| File/Directory | Purpose |
|----------------|---------|
| `server/data/` | Training data and models |
| `server/db.sqlite` | User database (SQLite) |
| `.env` | Environment configuration (gitignored) |
| `logs/` | Application logs |

## Support

- 📚 **Full Documentation**: [docs/deployment/SERVER_DEPLOYMENT.md](docs/deployment/SERVER_DEPLOYMENT.md)
- 🐛 **Issues**: https://github.com/voku/AmysEcho/issues
- 💬 **Discussions**: https://github.com/voku/AmysEcho/discussions

---

**Built for Amy** ❤️
