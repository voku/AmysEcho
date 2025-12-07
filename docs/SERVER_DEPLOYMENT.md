# Amy's Echo Server Deployment Guide

This guide provides step-by-step instructions for deploying the Amy's Echo server on your own infrastructure.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Deployment Methods](#deployment-methods)
   - [Docker Deployment (Recommended)](#docker-deployment-recommended)
   - [Manual Deployment with systemd](#manual-deployment-with-systemd)
4. [Production Configuration](#production-configuration)
5. [SSL/TLS Setup](#ssltls-setup)
6. [Reverse Proxy Configuration](#reverse-proxy-configuration)
7. [Monitoring and Logging](#monitoring-and-logging)
8. [Backup and Maintenance](#backup-and-maintenance)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Amy's Echo server is a Node.js/Express application with Python components for ML training. It provides:

- **Gesture sample upload endpoints** - Receives training data from the webapp
- **Model training pipeline** - Trains personalized MLP models using Python/MediaPipe
- **Model serving** - Distributes trained models to clients
- **Authentication** - JWT-based auth and legacy token support
- **Profile management** - Multi-child profile support
- **GDPR compliance** - Data export and deletion endpoints

**Default configuration:**
- Port: `5000`
- API Token: `demo-token` (change in production!)
- Data directory: `server/data/`
- Database: `server/db.json` (JSON file-based)

---

## Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 20.04+ recommended), macOS, or Windows with WSL2
- **CPU**: 2+ cores recommended for ML training
- **RAM**: 2GB minimum, 4GB+ recommended
- **Disk**: 10GB+ for models and training data
- **Node.js**: v18 or higher
- **Python**: 3.8+
- **Git**: For cloning the repository

### Required Software

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm python3 python3-pip git build-essential

# Verify versions
node --version    # Should be v18+
python3 --version # Should be 3.8+
```

---

## Deployment Methods

### Docker Deployment (Recommended)

Docker deployment provides isolation, consistency, and easy management.

#### Step 1: Create Dockerfile

Create a file named `Dockerfile` in the `server/` directory:

```dockerfile
FROM node:20-bullseye

# Install Python and system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY requirements.txt ./

# Install Node.js dependencies
RUN npm ci --production

# Install Python dependencies
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Create data directories
RUN mkdir -p data/models/global data/uploads

# Set production environment
ENV NODE_ENV=production

# Expose server port
EXPOSE 5000

# Start server
CMD ["node", "dist/server.js"]
```

#### Step 2: Create docker-compose.yml

Create `docker-compose.yml` in the repository root:

```yaml
version: '3.8'

services:
  amysecho-server:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: amysecho-server
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - API_TOKEN=${API_TOKEN:-demo-token}
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - BACKUP_SECRET=${BACKUP_SECRET}
      - API_LIMIT=${API_LIMIT:-120}
    volumes:
      # Persist data, models, and database
      - ./server/data:/app/data
      - ./server/db.json:/app/db.json
      # Optionally mount logs
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

#### Step 3: Create Environment File

Create `.env` file in the repository root:

```bash
# SECURITY: Change these in production!
API_TOKEN=your-secure-api-token-here
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
BACKUP_SECRET=your-backup-encryption-secret

# Rate limiting (requests per minute)
API_LIMIT=120

# Optional: External URLs
# CLOUD_API_URL=https://your-ml-service.com/classify
# GESTURE_TASK_URL=https://api.github.com/repos/your-org/dgs/contents/tasks
```

#### Step 4: Deploy with Docker

```bash
# Clone the repository
git clone https://github.com/voku/AmysEcho.git
cd AmysEcho

# Create the .env file (see above)
nano .env

# Build and start the container
docker-compose up -d

# Check logs
docker-compose logs -f amysecho-server

# Check health
curl http://localhost:5000/health
```

#### Docker Management Commands

```bash
# Stop the server
docker-compose down

# Restart the server
docker-compose restart

# View logs
docker-compose logs -f

# Update to latest code
git pull
docker-compose down
docker-compose build
docker-compose up -d

# Execute commands inside container
docker-compose exec amysecho-server bash
```

---

### Manual Deployment with systemd

For traditional Linux server deployment without Docker.

#### Step 1: Clone and Setup

```bash
# Create application user (recommended for security)
sudo useradd -r -s /bin/bash -m -d /opt/amysecho amysecho

# Clone repository
sudo -u amysecho git clone https://github.com/voku/AmysEcho.git /opt/amysecho/app
cd /opt/amysecho/app

# Install dependencies
cd server
sudo -u amysecho npm ci --production
sudo -u amysecho pip3 install -r requirements.txt

# Build TypeScript
sudo -u amysecho npm run build

# Create data directories
sudo -u amysecho mkdir -p data/models/global data/uploads
```

#### Step 2: Create Environment Configuration

Create `/opt/amysecho/app/server/.env`:

```bash
NODE_ENV=production
PORT=5000
API_TOKEN=your-secure-api-token-here
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
BACKUP_SECRET=your-backup-encryption-secret
API_LIMIT=120
```

```bash
# Set secure permissions
sudo chown amysecho:amysecho /opt/amysecho/app/server/.env
sudo chmod 600 /opt/amysecho/app/server/.env
```

#### Step 3: Create systemd Service

Create `/etc/systemd/system/amysecho.service`:

```ini
[Unit]
Description=Amy's Echo Server
After=network.target
Documentation=https://github.com/voku/AmysEcho

[Service]
Type=simple
User=amysecho
Group=amysecho
WorkingDirectory=/opt/amysecho/app/server
EnvironmentFile=/opt/amysecho/app/server/.env
ExecStart=/usr/bin/node /opt/amysecho/app/server/dist/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=amysecho

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/amysecho/app/server/data /opt/amysecho/app/server/db.json

# Resource limits
LimitNOFILE=65536
MemoryLimit=2G

[Install]
WantedBy=multi-user.target
```

#### Step 4: Enable and Start Service

```bash
# Reload systemd configuration
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable amysecho

# Start the service
sudo systemctl start amysecho

# Check status
sudo systemctl status amysecho

# View logs
sudo journalctl -u amysecho -f
```

#### systemd Management Commands

```bash
# Start service
sudo systemctl start amysecho

# Stop service
sudo systemctl stop amysecho

# Restart service
sudo systemctl restart amysecho

# View status
sudo systemctl status amysecho

# View logs (last 100 lines)
sudo journalctl -u amysecho -n 100

# Follow logs in real-time
sudo journalctl -u amysecho -f

# Disable auto-start on boot
sudo systemctl disable amysecho
```

---

## Production Configuration

### Security Best Practices

#### 1. Generate Secure Secrets

```bash
# Generate secure random tokens
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use OpenSSL
openssl rand -hex 32
```

Use these values for `API_TOKEN`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `BACKUP_SECRET`.

#### 2. Restrict File Permissions

```bash
# Secure environment file
chmod 600 /opt/amysecho/app/server/.env

# Secure database
chmod 600 /opt/amysecho/app/server/db.json

# Secure data directory
chmod 750 /opt/amysecho/app/server/data
```

#### 3. Configure Firewall

```bash
# Allow SSH (if not already allowed)
sudo ufw allow ssh

# Allow HTTP (for Let's Encrypt validation)
sudo ufw allow 80/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Block direct access to server port
# (Access should go through reverse proxy)
sudo ufw deny 5000/tcp

# Enable firewall
sudo ufw enable
```

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5000` | Server port |
| `API_TOKEN` | No | `demo-token` | Legacy API authentication token |
| `JWT_SECRET` | No | (insecure default) | JWT signing secret - CHANGE IN PRODUCTION |
| `JWT_REFRESH_SECRET` | No | (insecure default) | JWT refresh token secret - CHANGE IN PRODUCTION |
| `BACKUP_SECRET` | No | `default-secret-password` | Backup encryption secret |
| `NODE_ENV` | No | `development` | Environment (`production` recommended) |
| `API_LIMIT` | No | `120` | Rate limit (requests per minute) |
| `MLP_SCRIPT` | No | (auto) | Path to train_mlp.py |
| `DB_PATH` | No | `server/db.json` | Database file path |

---

## SSL/TLS Setup

### Option 1: Let's Encrypt with Certbot

```bash
# Install Certbot
sudo apt install certbot

# Stop nginx temporarily (if running)
sudo systemctl stop nginx

# Obtain certificate
sudo certbot certonly --standalone -d your-domain.com

# Certificates will be at:
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem

# Setup auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### Option 2: Self-Signed Certificate (Development/Testing)

```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/amysecho.key \
  -out /etc/ssl/certs/amysecho.crt \
  -subj "/CN=your-domain.com"
```

---

## Reverse Proxy Configuration

### nginx Configuration

#### Step 1: Install nginx

```bash
sudo apt install nginx
```

#### Step 2: Create nginx Configuration

Create `/etc/nginx/sites-available/amysecho`:

```nginx
# HTTP -> HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;

    # Let's Encrypt validation
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL security settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Client body size (for video uploads)
    client_max_body_size 100M;

    # Health check endpoint (no auth required)
    location /health {
        proxy_pass http://localhost:5000/health;
        access_log off;
    }

    # CORS headers for the public webapp + reverse proxy to Node.js
    # Adjust the allowed origin list to match your deployment (example: https://voku.github.io)
    set $amysecho_cors_origin "";
    if ($http_origin = "https://voku.github.io") {
        set $amysecho_cors_origin $http_origin;
    }

    location / {
        add_header 'Access-Control-Allow-Origin' $amysecho_cors_origin always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, x-profile-id' always;
        add_header 'Access-Control-Max-Age' 86400 always;

        if ($request_method = OPTIONS) {
            return 204;
        }

        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Logging
    access_log /var/log/nginx/amysecho-access.log;
    error_log /var/log/nginx/amysecho-error.log;
}
```

#### Using nginx via ISPConfig

If your virtual server is managed through ISPConfig, you can keep ISPConfig in place and still reuse the standard nginx reverse proxy shown above. The goal is to forward HTTPS traffic from the ISPConfig-managed vhost to the Amy's Echo Node.js service on `127.0.0.1:5000` while preserving Let's Encrypt handling.

1. **Create or reuse your site in ISPConfig** and enable Let's Encrypt for the domain. ISPConfig will manage certificate renewal automatically; the `ssl_certificate` paths in its generated vhost already point to the right files.
2. **Open the "Apache/Nginx Directives" (or custom nginx directives) field** for the site and replace the location section with a reverse proxy to the Node.js service:

   ```nginx
   location / {
       proxy_pass http://127.0.0.1:5000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       client_max_body_size 100m;

       # CORS for browser clients (update the origin for your deployment)
       add_header 'Access-Control-Allow-Origin' 'https://voku.github.io' always;
       add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
       add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, x-profile-id' always;
       add_header 'Access-Control-Max-Age' 86400 always;

       if ($request_method = OPTIONS) {
           return 204;
       }
   }
   ```

3. **Keep the existing `/.well-known/acme-challenge` block** that ISPConfig generates so certificate renewals continue to work. Do not proxy those requests.
4. **Reload nginx** from ISPConfig or via SSH after saving the directives:

   ```bash
   sudo systemctl reload nginx
   ```

5. **Health check:** verify both the direct service and the proxied endpoint:

   ```bash
   curl http://127.0.0.1:5000/health
   curl https://your-domain/health
   ```

If you prefer to bypass ISPConfig entirely, you can disable its vhost for the domain and drop in the standalone nginx config above under `/etc/nginx/sites-available/amysecho`.

### Step-by-step ISPConfig-managed setup (no Docker)

The commands below match the directory layout shown in the provided context (`/var/www/amysecho.moelleken.org/home/voku_amysecho`). Replace user/group names if your ISPConfig instance uses different IDs.

1. **Install prerequisites (Node.js 20, Python, build tools):**
   ```bash
   sudo apt update
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs python3 python3-pip python3-venv git build-essential
   node -v   # verify v20+
   python3 --version
   ```

2. **Clone the repository into your ISPConfig user home:**
   ```bash
   cd /var/www/amysecho.moelleken.org/home/voku_amysecho
   git clone https://github.com/voku/AmysEcho.git
   cd AmysEcho/server
   ```

3. **Install server dependencies and build (use a venv to avoid PEP 668 errors):**
   ```bash
   # Install full deps so TypeScript (tsc) is available for the build
   npm ci

   # Create and enter a local virtual environment for Python deps
   python3 -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   deactivate

   npm run build
   # (Optional) trim dev dependencies after the build if you want a leaner runtime
   npm ci --omit=dev
   mkdir -p data/models/global data/uploads
   ```

4. **Create the environment file (`server/.env`):**
   ```bash
   cat > .env <<'EOF'
   NODE_ENV=production
   PORT=5000
   API_TOKEN=replace-with-strong-api-token
   JWT_SECRET=replace-with-long-secret
   JWT_REFRESH_SECRET=replace-with-long-refresh-secret
   BACKUP_SECRET=replace-with-backup-secret
   API_LIMIT=120
   EOF
   chmod 600 .env
   chown web7:client1 .env
   ```

5. **Create a systemd service to run as the ISPConfig web user (e.g., `web7`):**
   ```bash
   sudo tee /etc/systemd/system/amysecho.service > /dev/null <<'EOF'
   [Unit]
   Description=Amy's Echo Server
   After=network.target

   [Service]
   Type=simple
   User=web7
   Group=client1
   WorkingDirectory=/var/www/amysecho.moelleken.org/home/voku_amysecho/AmysEcho/server
   EnvironmentFile=/var/www/amysecho.moelleken.org/home/voku_amysecho/AmysEcho/server/.env
   ExecStart=/usr/bin/node /var/www/amysecho.moelleken.org/home/voku_amysecho/AmysEcho/server/dist/server.js
   Restart=always
   RestartSec=10
   StandardOutput=journal
   StandardError=journal
   SyslogIdentifier=amysecho
   NoNewPrivileges=true
   PrivateTmp=true
   ProtectSystem=strict
   ProtectHome=true
   ReadWritePaths=/var/www/amysecho.moelleken.org/home/voku_amysecho/AmysEcho/server/data /var/www/amysecho.moelleken.org/home/voku_amysecho/AmysEcho/server/db.json

   [Install]
   WantedBy=multi-user.target
   EOF

   sudo systemctl daemon-reload
   sudo systemctl enable --now amysecho
   sudo systemctl status amysecho
   ```

6. **Update the ISPConfig nginx vhost to proxy to the Node.js service:** add these locations inside the existing server block (after the ACME section, keep the `/.well-known/acme-challenge` block untouched):
   ```nginx
   location /health {
       proxy_pass http://127.0.0.1:5000/health;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }

   location / {
       proxy_pass http://127.0.0.1:5000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       client_max_body_size 100m;
   }
   ```
   Reload nginx via ISPConfig or:
   ```bash
   sudo systemctl reload nginx
   ```

7. **Verify service and proxy:**
   ```bash
   curl http://127.0.0.1:5000/health        # direct service
   curl https://amysecho.moelleken.org/health # through nginx/ISPConfig
   sudo journalctl -u amysecho -f            # tail service logs
   ```

With these steps, your ISPConfig-managed server runs the Amy's Echo Node.js service under systemd while nginx proxies HTTPS traffic to it.

#### Step 3: Enable and Test Configuration

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/amysecho /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### Apache Configuration (Alternative)

Create `/etc/apache2/sites-available/amysecho.conf`:

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    Redirect permanent / https://your-domain.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName your-domain.com

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/your-domain.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/your-domain.com/privkey.pem

    ProxyPreserveHost On
    ProxyPass / http://localhost:5000/
    ProxyPassReverse / http://localhost:5000/

    # Security headers
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"

    ErrorLog ${APACHE_LOG_DIR}/amysecho-error.log
    CustomLog ${APACHE_LOG_DIR}/amysecho-access.log combined
</VirtualHost>
```

```bash
# Enable modules
sudo a2enmod ssl proxy proxy_http headers

# Enable site
sudo a2ensite amysecho

# Test configuration
sudo apache2ctl configtest

# Reload Apache
sudo systemctl reload apache2
```

---

## Monitoring and Logging

### Application Logs

#### systemd logs
```bash
# View all logs
sudo journalctl -u amysecho

# Follow logs in real-time
sudo journalctl -u amysecho -f

# Logs from last hour
sudo journalctl -u amysecho --since "1 hour ago"

# Logs with specific priority
sudo journalctl -u amysecho -p err
```

#### Docker logs
```bash
# View logs
docker-compose logs amysecho-server

# Follow logs
docker-compose logs -f amysecho-server

# Last 100 lines
docker-compose logs --tail=100 amysecho-server
```

### Training Logs

The server writes training progress to:
- `server/data/training-debug.log`
- `server/training-debug.log`

```bash
# Monitor training
tail -f /opt/amysecho/app/server/data/training-debug.log
```

### Health Monitoring

#### Basic Health Check
```bash
curl https://your-domain.com/health
# Expected: {"status":"ok","uptime":123.45,"pendingTrainingJobs":0}
```

#### Monitoring Script

Create `/opt/amysecho/monitor.sh`:

```bash
#!/bin/bash

HEALTH_URL="http://localhost:5000/health"
LOG_FILE="/var/log/amysecho-monitor.log"

response=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")

timestamp=$(date '+%Y-%m-%d %H:%M:%S')

if [ "$response" = "200" ]; then
    echo "[$timestamp] OK - Server is healthy" >> "$LOG_FILE"
else
    echo "[$timestamp] ERROR - Server health check failed (HTTP $response)" >> "$LOG_FILE"
    # Optional: Send alert email
    # echo "Server health check failed" | mail -s "Amy's Echo Alert" admin@example.com
fi
```

```bash
# Make executable
sudo chmod +x /opt/amysecho/monitor.sh

# Add to crontab (check every 5 minutes)
sudo crontab -e
# Add: */5 * * * * /opt/amysecho/monitor.sh
```

### System Resource Monitoring

```bash
# CPU and memory usage
ps aux | grep node

# Disk usage
df -h /opt/amysecho

# Check data directory size
du -sh /opt/amysecho/app/server/data
```

---

## Backup and Maintenance

### Automated Backup Script

Create `/opt/amysecho/backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/var/backups/amysecho"
APP_DIR="/opt/amysecho/app/server"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/amysecho_backup_$TIMESTAMP.tar.gz"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Stop service (optional, for consistency)
# sudo systemctl stop amysecho

# Create backup
tar -czf "$BACKUP_FILE" \
    -C "$APP_DIR" \
    data/ \
    db.json

# Restart service (if stopped)
# sudo systemctl start amysecho

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "amysecho_backup_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE"
```

```bash
# Make executable
sudo chmod +x /opt/amysecho/backup.sh

# Schedule daily backup at 2 AM
sudo crontab -e
# Add: 0 2 * * * /opt/amysecho/backup.sh >> /var/log/amysecho-backup.log 2>&1
```

### Restore from Backup

```bash
# Stop service
sudo systemctl stop amysecho

# Restore backup
cd /opt/amysecho/app/server
sudo tar -xzf /var/backups/amysecho/amysecho_backup_YYYYMMDD_HHMMSS.tar.gz

# Fix permissions
sudo chown -R amysecho:amysecho data/ db.json

# Start service
sudo systemctl start amysecho
```

### Update Procedure

```bash
# Stop service
sudo systemctl stop amysecho

# Backup current version
sudo /opt/amysecho/backup.sh

# Update code
cd /opt/amysecho/app
sudo -u amysecho git pull

# Update dependencies
cd server
sudo -u amysecho npm ci --production
sudo -u amysecho pip3 install -r requirements.txt

# Rebuild TypeScript
sudo -u amysecho npm run build

# Start service
sudo systemctl start amysecho

# Check status
sudo systemctl status amysecho
sudo journalctl -u amysecho -n 50
```

---

## Troubleshooting

### Server Won't Start

**Check logs:**
```bash
sudo journalctl -u amysecho -n 100
```

**Common issues:**

1. **Port already in use**
   ```bash
   # Find what's using port 5000
   sudo lsof -i :5000
   # Kill the process or change PORT in .env
   ```

2. **Missing dependencies**
   ```bash
   cd /opt/amysecho/app/server
   npm ci
   pip3 install -r requirements.txt
   ```

3. **Permission errors**
   ```bash
   sudo chown -R amysecho:amysecho /opt/amysecho/app/server
   ```

4. **Database locked**
   ```bash
   # Check for stale lock files
   rm /opt/amysecho/app/server/db.json.lock
   ```

### Training Fails

**Check training logs:**
```bash
tail -f /opt/amysecho/app/server/data/training-debug.log
```

**Common issues:**

1. **Python dependencies missing**
   ```bash
   pip3 install -r requirements.txt
   ```

2. **MediaPipe issues**
   ```bash
   # Install system dependencies
   sudo apt install libgl1-mesa-glx libglib2.0-0
   ```

3. **Insufficient memory**
   ```bash
   # Check available memory
   free -h
   # Consider increasing swap or system RAM
   ```

### High CPU/Memory Usage

**Identify the issue:**
```bash
# Top processes
top

# Node.js memory usage
ps aux | grep node

# Check training queue
curl -H "Authorization: Bearer your-api-token" \
     http://localhost:5000/health
```

**Solutions:**
- Limit concurrent training jobs
- Increase `API_LIMIT` to reduce request load
- Add more system resources

### Connection Issues

**Test connectivity:**
```bash
# Local connection
curl http://localhost:5000/health

# External connection
curl https://your-domain.com/health

# Check nginx status
sudo systemctl status nginx

# Check nginx logs
sudo tail -f /var/log/nginx/amysecho-error.log
```

### SSL Certificate Issues

**Check certificate:**
```bash
sudo certbot certificates

# Renew manually
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run
```

---

## Quick Reference

### Important File Locations

| Item | Path |
|------|------|
| Application | `/opt/amysecho/app/server` |
| Environment | `/opt/amysecho/app/server/.env` |
| Database | `/opt/amysecho/app/server/db.json` |
| Data directory | `/opt/amysecho/app/server/data` |
| Models | `/opt/amysecho/app/server/data/models` |
| Uploads | `/opt/amysecho/app/server/data/uploads` |
| Training logs | `/opt/amysecho/app/server/data/training-debug.log` |
| systemd service | `/etc/systemd/system/amysecho.service` |
| nginx config | `/etc/nginx/sites-available/amysecho` |
| SSL certificates | `/etc/letsencrypt/live/your-domain.com/` |

### Essential Commands

```bash
# Start/Stop/Restart
sudo systemctl start amysecho
sudo systemctl stop amysecho
sudo systemctl restart amysecho

# View status and logs
sudo systemctl status amysecho
sudo journalctl -u amysecho -f

# Health check
curl http://localhost:5000/health

# Backup
sudo /opt/amysecho/backup.sh

# Update
cd /opt/amysecho/app && git pull
cd server && npm ci && npm run build
sudo systemctl restart amysecho
```

---

## Next Steps

1. **Configure the webapp** to point to your server:
   - Set `VITE_API_URL=https://your-domain.com` when building the webapp
   - See `docs/DEPLOYMENT.md` for webapp deployment

2. **Test the full workflow:**
   - Record a gesture in the webapp
   - Verify upload to server
   - Check training logs
   - Download updated model

3. **Setup monitoring:**
   - Configure health check monitoring
   - Setup log aggregation (optional)
   - Configure alerts for failures

4. **Regular maintenance:**
   - Monitor disk usage in `data/` directory
   - Review logs periodically
   - Keep system and dependencies updated
   - Test backup restoration procedure

---

## Support

For issues or questions:
- Check the [Troubleshooting](#troubleshooting) section
- Review server logs: `sudo journalctl -u amysecho -n 100`
- Check training logs: `tail -f server/data/training-debug.log`
- Open an issue: https://github.com/voku/AmysEcho/issues

---

**Remember:** This system is built for Amy. Every deployment brings communication closer to children who need it. ❤️
