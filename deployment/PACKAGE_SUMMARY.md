# Server Deployment - Complete Package Summary

This package provides everything you need to deploy the Amy's Echo server to your own infrastructure.

## 📦 What's Included

### Documentation

1. **[docs/deployment/quickstart-server.md](../docs/deployment/quickstart-server.md)** - 5-minute deployment guide
   - Quick Docker setup
   - Basic configuration
   - Health check verification
   - Perfect for getting started

2. **[docs/deployment/SERVER_deployment.md](../docs/deployment/SERVER_deployment.md)** - Comprehensive deployment guide (21KB)
   - Docker deployment (recommended)
   - Manual deployment with systemd
   - Production configuration
   - SSL/TLS setup with Let's Encrypt
   - nginx reverse proxy configuration
   - Monitoring and logging
   - Backup and maintenance procedures
   - Detailed troubleshooting

3. **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** - Production readiness checklist
   - Pre-deployment requirements
   - Installation steps
   - Security hardening
   - Testing procedures
   - Maintenance schedule

### Configuration Files

1. **[.env.example](../.env.example)** - Environment configuration template
   - All required environment variables
   - Security settings
   - Server configuration
   - Comments explaining each setting

2. **[docker-compose.yml](../docker-compose.yml)** - Docker orchestration
   - Single-command deployment
   - Volume persistence
   - Health checks
   - Production-ready defaults

3. **[server/Dockerfile](../server/Dockerfile)** - Container image definition
   - Node.js + Python environment
   - Dependency installation
   - TypeScript build
   - Health checks

### Service Configuration

1. **[systemd/amysecho.service](systemd/amysecho.service)** - systemd service file
   - Auto-start on boot
   - Automatic restart on failure
   - Security hardening
   - Resource limits
   - Proper logging

2. **[nginx/amysecho.conf](nginx/amysecho.conf)** - nginx reverse proxy
   - HTTPS termination
   - HTTP to HTTPS redirect
   - Security headers
   - Request proxying
   - Health check endpoint

### Automation Scripts

1. **[scripts/backup.sh](scripts/backup.sh)** - Automated backup
   - Compresses data and database
   - Configurable retention (default: 7 days)
   - Logging
   - Error handling
   - Can run as cron job

2. **[scripts/monitor.sh](scripts/monitor.sh)** - Health monitoring
   - Checks health endpoint
   - Logs results
   - Optional email alerts
   - Can run as cron job

## 🚀 Quick Deployment Paths

### Path 1: Docker (Fastest - 5 minutes)

```bash
git clone https://github.com/voku/AmysEcho.git
cd AmysEcho
cp .env.example .env
# Edit .env and set secure secrets
docker-compose up -d
curl http://localhost:5000/health
```

**Use when:** You want the fastest deployment with minimal configuration

### Path 2: Docker + HTTPS (Production - 15 minutes)

```bash
# Same as Path 1, plus:
sudo apt install nginx certbot
sudo cp deployment/nginx/amysecho.conf /etc/nginx/sites-available/amysecho
# Edit config with your domain
sudo ln -s /etc/nginx/sites-available/amysecho /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.com
sudo systemctl reload nginx
```

**Use when:** You need production-ready HTTPS deployment

### Path 3: Manual systemd (Full Control - 30 minutes)

Follow the complete guide in [docs/deployment/SERVER_deployment.md](../docs/deployment/SERVER_deployment.md#manual-deployment-with-systemd)

**Use when:** You need fine-grained control or cannot use Docker

## 📋 Deployment Comparison

| Feature | Docker | Docker + HTTPS | Manual systemd |
|---------|--------|----------------|----------------|
| **Time to deploy** | 5 min | 15 min | 30 min |
| **Difficulty** | ⭐ Easy | ⭐⭐ Medium | ⭐⭐⭐ Advanced |
| **Isolation** | ✅ Container | ✅ Container | ❌ System-wide |
| **HTTPS** | ❌ No | ✅ Yes | ✅ Yes (manual) |
| **Auto-restart** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Easy updates** | ✅ Yes | ✅ Yes | ⚠️ Manual |
| **Resource usage** | Medium | Medium | Low |

## 🔒 Security Checklist

Before going live, ensure you've:

- ✅ Changed all default secrets (JWT_SECRET, JWT_REFRESH_SECRET, BACKUP_SECRET)
- ✅ Configured HTTPS with valid SSL certificate
- ✅ Set up firewall (allow only 22, 80, 443)
- ✅ Restricted file permissions (600 for .env, db.json)
- ✅ Enabled automatic security updates
- ✅ Configured log monitoring
- ✅ Set up automated backups

See [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) for the complete list.

## 📊 Resource Requirements

### Minimum
- 1 CPU core
- 2GB RAM
- 10GB disk space
- 10 Mbps network

### Recommended
- 2+ CPU cores
- 4GB RAM
- 20GB+ disk space
- 100 Mbps network

### Scaling Considerations

The server can handle:
- **Training**: 1 concurrent job (CPU intensive)
- **API requests**: 120/min per IP (configurable)
- **Concurrent users**: ~50 with recommended specs
- **Storage**: ~100MB per 1000 samples

## 🔧 Customization Options

### Environment Variables

All configuration via `.env` file:
- Server port
- API rate limits
- Authentication secrets
- Optional cloud API integration

### nginx Configuration

Customize in `deployment/nginx/amysecho.conf`:
- Domain name
- SSL certificate paths
- Upload size limits
- Timeout values
- Security headers

### systemd Service

Customize in `deployment/systemd/amysecho.service`:
- User/group
- Resource limits (memory, CPU)
- Restart policies
- Security settings

## 📈 Monitoring Setup

### Health Endpoint

```bash
curl https://your-domain.com/health
```

Returns:
```json
{
  "status": "ok",
  "uptime": 12345.67,
  "pendingTrainingJobs": 0
}
```

### Automated Monitoring

Setup the monitoring script:
```bash
sudo cp deployment/scripts/monitor.sh /usr/local/bin/amysecho-monitor
sudo chmod +x /usr/local/bin/amysecho-monitor
(crontab -l; echo "*/5 * * * * /usr/local/bin/amysecho-monitor") | crontab -
```

Checks every 5 minutes, logs to `/var/log/amysecho-monitor.log`

### Log Locations

- **Application logs**: `journalctl -u amysecho -f` (systemd) or `docker-compose logs -f` (Docker)
- **Training logs**: `server/data/training-debug.log`
- **nginx logs**: `/var/log/nginx/amysecho-*.log`
- **Monitoring logs**: `/var/log/amysecho-monitor.log`

## 💾 Backup Strategy

### Automated Backups

Setup the backup script:
```bash
sudo cp deployment/scripts/backup.sh /usr/local/bin/amysecho-backup
sudo chmod +x /usr/local/bin/amysecho-backup
(crontab -l; echo "0 2 * * * /usr/local/bin/amysecho-backup") | crontab -
```

Runs daily at 2 AM, keeps 7 days of backups.

### What Gets Backed Up

- `server/data/` - Training data and models
- `server/db.json` - User database

### Manual Backup

```bash
# Docker
docker-compose exec amysecho-server tar -czf /tmp/backup.tar.gz /app/data /app/db.json
docker cp amysecho-server:/tmp/backup.tar.gz ./backup.tar.gz

# Manual
tar -czf backup.tar.gz -C /opt/amysecho/app/server data/ db.json
```

## 🔄 Update Procedure

### Docker

```bash
cd AmysEcho
git pull
docker-compose down
docker-compose build
docker-compose up -d
docker-compose logs -f
```

### Manual systemd

```bash
sudo systemctl stop amysecho
cd /opt/amysecho/app
git pull
cd server
npm ci --production
pip3 install -r requirements.txt
npm run build
sudo systemctl start amysecho
sudo journalctl -u amysecho -n 50
```

## 🆘 Common Issues

### Port Already in Use
Change `PORT` in `.env` or stop conflicting service

### Permission Denied
Check file permissions and ownership (should be `amysecho:amysecho` for manual, `root:root` for Docker)

### Training Fails
Check Python dependencies: `pip3 install -r server/requirements.txt`

### Cannot Connect
Check firewall: `sudo ufw status` and allow necessary ports

See [docs/deployment/SERVER_deployment.md#troubleshooting](../docs/deployment/SERVER_deployment.md#troubleshooting) for detailed troubleshooting.

## 📞 Getting Help

1. Check [docs/deployment/SERVER_deployment.md](../docs/deployment/SERVER_deployment.md) for detailed documentation
2. Review [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) to ensure all steps completed
3. Check logs for specific error messages
4. Open an issue: https://github.com/voku/AmysEcho/issues

## 🎯 Next Steps After Deployment

1. **Configure the webapp** to use your server URL
2. **Test the full workflow** (record → upload → train → download)
3. **Setup monitoring** and verify alerts work
4. **Test backup restoration** to ensure backups are valid
5. **Document your deployment** for your team
6. **Schedule regular maintenance** following the checklist

## ❤️ Built for Amy

Every deployment brings communication closer to children who need it. Thank you for deploying Amy's Echo!

---

**Questions?** See the comprehensive guide: [docs/deployment/SERVER_deployment.md](../docs/deployment/SERVER_deployment.md)
