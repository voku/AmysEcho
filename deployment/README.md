# Deployment Configuration Files

This directory contains configuration files and scripts for deploying Amy's Echo server to production.

## Contents

### nginx/
- `amysecho.conf` - nginx reverse proxy configuration for HTTPS termination and request routing

### systemd/
- `amysecho.service` - systemd service unit file for running the server as a system service

### scripts/
- `backup.sh` - Automated backup script for data and database
- `update-server.sh` - Updates server dependencies and restarts the systemd service
- `monitor.sh` - Health check monitoring script with alerting

## Quick Start

For complete deployment instructions, see **[docs/deployment/SERVER_DEPLOYMENT.md](../docs/deployment/SERVER_DEPLOYMENT.md)**.

### Using Docker (Recommended)

```bash
# From repository root
docker-compose up -d
```

### Manual Deployment

1. **Setup systemd service:**
   ```bash
   sudo cp deployment/systemd/amysecho.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable amysecho
   sudo systemctl start amysecho
   ```

2. **Setup nginx reverse proxy:**
   ```bash
   sudo cp deployment/nginx/amysecho.conf /etc/nginx/sites-available/amysecho
   # Edit the file to update your-domain.com
   sudo ln -s /etc/nginx/sites-available/amysecho /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

3. **Setup automated backups:**
   ```bash
   sudo cp deployment/scripts/backup.sh /opt/amysecho/
   sudo chmod +x /opt/amysecho/backup.sh
   # Add to crontab: 0 2 * * * /opt/amysecho/backup.sh
   ```

4. **Setup health monitoring:**
   ```bash
   sudo cp deployment/scripts/monitor.sh /opt/amysecho/
   sudo chmod +x /opt/amysecho/monitor.sh
   # Add to crontab: */5 * * * * /opt/amysecho/monitor.sh
   ```

## Updating the Server

Use the update script to pull the latest code, install dependencies, rebuild, and restart:

```bash
sudo /opt/amysecho/app/deployment/scripts/update-server.sh

# Empfohlen: Reverse-Proxy + Upload-Endpunkt öffentlich validieren
sudo PUBLIC_BASE_URL="https://your-domain.com" /opt/amysecho/app/deployment/scripts/update-server.sh

# Optional (hartes Gate): Abbruch wenn empfohlene nginx/ISPConfig-Proxy-Settings fehlen
sudo PUBLIC_BASE_URL="https://your-domain.com" STRICT_PROXY_RECOMMENDATIONS=true /opt/amysecho/app/deployment/scripts/update-server.sh
```

Hinweis für ISPConfig: **"Enable PROXY Protocol" muss deaktiviert bleiben**, sonst kann die Route-Erkennung fehlschlagen.

### Breaking Changes

If updating to a version with breaking changes (API route changes, auth model changes, etc.), use the re-initialization script instead:

```bash
sudo /opt/amysecho/app/deployment/scripts/re-init-after-breaking-changes.sh
```

This script will:
- Create a backup before making changes
- Apply database migrations if needed
- Update all dependencies
- Rebuild the application
- Restart services and verify health

See `docs/BREAKING_CHANGES.md` for details on what changed and why.

## Configuration Files

### Environment Variables

Copy `.env.example` to `.env` and update:

```bash
cp .env.example .env
# Edit .env with your production values
```

**Important:** Change all default secrets in production!

### SSL Certificates

Use Let's Encrypt for free SSL certificates:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com
```

Update nginx configuration with the certificate paths.

## Support

For issues or questions, see the [Troubleshooting section](../docs/deployment/SERVER_DEPLOYMENT.md#troubleshooting) in the deployment guide.
