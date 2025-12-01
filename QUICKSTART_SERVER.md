# Amy's Echo Server - Quick Start Guide

This guide gets your Amy's Echo server running in **5 minutes**.

For complete deployment documentation, see **[docs/SERVER_DEPLOYMENT.md](docs/SERVER_DEPLOYMENT.md)**.

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
echo "API_TOKEN=$(openssl rand -hex 32)" >> .env
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
docker-compose exec amysecho-server tar -czf /tmp/backup.tar.gz /app/data /app/db.json

# Access container shell
docker-compose exec amysecho-server bash
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

## Manual Deployment (Without Docker)

If you prefer not to use Docker, see the complete manual deployment instructions in **[docs/SERVER_DEPLOYMENT.md](docs/SERVER_DEPLOYMENT.md#manual-deployment-with-systemd)**.

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server port |
| `API_TOKEN` | `demo-token` | Legacy API token (change in production!) |
| `JWT_SECRET` | (insecure) | JWT signing secret (change in production!) |
| `JWT_REFRESH_SECRET` | (insecure) | Refresh token secret (change in production!) |
| `NODE_ENV` | `development` | Environment mode |
| `API_LIMIT` | `120` | Rate limit (requests/minute) |

### Important Files

| File/Directory | Purpose |
|----------------|---------|
| `server/data/` | Training data and models |
| `server/db.json` | User database |
| `.env` | Environment configuration (gitignored) |
| `logs/` | Application logs |

## Support

- 📚 **Full Documentation**: [docs/SERVER_DEPLOYMENT.md](docs/SERVER_DEPLOYMENT.md)
- 🐛 **Issues**: https://github.com/voku/AmysEcho/issues
- 💬 **Discussions**: https://github.com/voku/AmysEcho/discussions

---

**Built for Amy** ❤️
