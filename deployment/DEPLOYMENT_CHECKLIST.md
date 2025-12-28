# Server Deployment Checklist

Use this checklist to ensure a complete and secure server deployment.

## Pre-Deployment

- [ ] Server meets minimum requirements (2+ CPU cores, 4GB RAM, 10GB disk)
- [ ] Domain name configured and DNS pointing to server IP
- [ ] SSH access configured with key-based authentication
- [ ] Firewall configured (allow SSH, HTTP, HTTPS)
- [ ] Server OS updated (`sudo apt update && sudo apt upgrade`)

## Installation

- [ ] Git installed
- [ ] Node.js v18+ installed
- [ ] Python 3.8+ installed
- [ ] Docker and docker-compose installed (if using Docker method)
- [ ] nginx installed (if using manual method with reverse proxy)

## Configuration

- [ ] Repository cloned to server
- [ ] `.env` file created from `.env.example`
- [ ] All secrets changed from defaults:
  - [ ] `JWT_SECRET` (32+ character random string)
  - [ ] `JWT_REFRESH_SECRET` (32+ character random string)
  - [ ] `BACKUP_SECRET` (32+ character random string)
- [ ] `NODE_ENV=production` set
- [ ] Port configuration verified (default: 5000)
- [ ] Rate limiting configured appropriately

## SSL/TLS Setup

- [ ] SSL certificate obtained (Let's Encrypt recommended)
- [ ] Certificate auto-renewal configured
- [ ] nginx/Apache configured for HTTPS
- [ ] HTTP to HTTPS redirect working
- [ ] Security headers configured

## Server Setup

### Docker Method
- [ ] `docker-compose.yml` reviewed and customized if needed
- [ ] Volumes configured for data persistence
- [ ] Container started: `docker-compose up -d`
- [ ] Container health check passing
- [ ] Logs checked for errors

### Manual Method
- [ ] Application user created (`amysecho`)
- [ ] Dependencies installed (npm, pip)
- [ ] TypeScript compiled: `npm run build`
- [ ] systemd service file installed
- [ ] Service enabled: `sudo systemctl enable amysecho`
- [ ] Service started: `sudo systemctl start amysecho`
- [ ] Service status verified

## Reverse Proxy

- [ ] nginx/Apache configuration file installed
- [ ] Domain name updated in configuration
- [ ] SSL certificate paths updated
- [ ] Configuration tested: `sudo nginx -t`
- [ ] Web server reloaded
- [ ] Reverse proxy working (test with `curl https://your-domain.com/health`)

## Security Hardening

- [ ] Firewall configured (UFW or iptables)
- [ ] Direct access to application port blocked from outside
- [ ] File permissions set correctly:
  - [ ] `.env` file: 600 (read/write owner only)
  - [ ] `db.json`: 600
  - [ ] `data/` directory: 750
- [ ] Fail2ban configured (optional but recommended)
- [ ] SSH key-only authentication enabled
- [ ] Root login disabled

## Monitoring & Logging

- [ ] Health check endpoint accessible: `/health`
- [ ] Monitoring script installed and scheduled
- [ ] Log rotation configured
- [ ] Application logs accessible and readable
- [ ] nginx/Apache access and error logs configured
- [ ] Disk space monitoring setup
- [ ] Email alerts configured (optional)

## Backup Strategy

- [ ] Backup script installed
- [ ] Backup directory created with appropriate permissions
- [ ] Backup schedule configured (cron)
- [ ] Backup retention policy set
- [ ] Test backup created
- [ ] Test restore performed successfully
- [ ] Off-site backup configured (optional but recommended)

## Testing

- [ ] Health endpoint returns 200: `curl https://your-domain.com/health`
- [ ] API authentication working
- [ ] Sample upload working (test with webapp)
- [ ] Model training working
- [ ] Model download working
- [ ] HTTPS working without certificate errors
- [ ] HTTP redirects to HTTPS
- [ ] Rate limiting working (test with multiple rapid requests)

## Webapp Integration

- [ ] Webapp configured with server URL (`VITE_API_URL`)
- [ ] Webapp can connect to server
- [ ] CORS configured if webapp on different domain
- [ ] End-to-end workflow tested:
  - [ ] Record gesture in webapp
  - [ ] Sample uploaded to server
  - [ ] Training job started
  - [ ] Model downloaded to webapp
  - [ ] Gesture recognized with updated model

## Documentation

- [ ] Server URL documented for team
- [ ] API token securely shared with authorized users
- [ ] Backup procedure documented
- [ ] Recovery procedure documented
- [ ] Monitoring dashboard/logs location documented
- [ ] Contact information for alerts configured

## Post-Deployment

- [ ] Server running for 24 hours without issues
- [ ] Logs reviewed for errors or warnings
- [ ] Performance metrics baseline established
- [ ] Load testing performed (optional)
- [ ] Disaster recovery plan documented
- [ ] Update schedule established
- [ ] Security audit scheduled

## Maintenance Tasks

### Daily
- [ ] Check monitoring alerts
- [ ] Review critical errors in logs

### Weekly
- [ ] Review application logs
- [ ] Check disk space usage
- [ ] Verify backups are running
- [ ] Check system resource usage (CPU, RAM, disk I/O)

### Monthly
- [ ] Apply security updates
- [ ] Test backup restoration
- [ ] Review and rotate logs
- [ ] Review user access and permissions
- [ ] Update dependencies (after testing)

### Quarterly
- [ ] Full security audit
- [ ] Disaster recovery drill
- [ ] Review and update documentation
- [ ] Performance optimization review

## Emergency Contacts

Document key contacts:
- [ ] System administrator: _______________
- [ ] Application developer: _______________
- [ ] Domain/DNS provider: _______________
- [ ] Hosting provider support: _______________
- [ ] SSL certificate provider: _______________

## Notes

Additional deployment-specific notes:

```
[Add your notes here]
```

---

**Deployment Date**: _______________  
**Deployed By**: _______________  
**Server Hostname**: _______________  
**Server IP**: _______________  
**Domain**: _______________  

---

Once all items are checked, your server is production-ready! 🚀

For support, see [docs/deployment/SERVER_DEPLOYMENT.md](../docs/deployment/SERVER_DEPLOYMENT.md) or open an issue at https://github.com/voku/AmysEcho/issues
