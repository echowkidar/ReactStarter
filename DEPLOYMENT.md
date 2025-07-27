# ReactStarter Deployment Guide

This document provides step-by-step instructions for deploying this application on a VPS with CyberPanel.

## Prerequisites
- VPS with CyberPanel installed
- PostgreSQL database
- Node.js 18+ and npm installed
- Domain configured in CyberPanel

## Deployment Steps

### 1. Set Up Project Directory
```bash
mkdir -p /var/www/yourdomain.com
cd /var/www/yourdomain.com
git clone https://github.com/echowkidar/ReactStarter.git .
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a .env file:
```bash
cat > .env << EOF
DATABASE_URL=postgresql://username:password@database_host:5432/database_name
NODE_ENV=production
PORT=5001
EOF
```

### 4. Build the Application
```bash
npm run build
```

### 5. Set Up PM2 for Process Management
```bash
# Install PM2 globally if not installed
npm install -g pm2

# Start the application with PM2
pm2 start ecosystem.config.cjs

# Set PM2 to start on system boot
pm2 save
pm2 startup
```

### 6. Configure CyberPanel (OpenLiteSpeed)

1. Create a website in CyberPanel for your domain
2. Edit the vhost.conf file:
   ```bash
   nano /usr/local/lsws/conf/vhosts/yourdomain.com/vhost.conf
   ```

3. Add these configurations to the file:
   ```
   extprocessor nodejs {
     type                    proxy
     address                 127.0.0.1:5001
     maxConns                100
     pcKeepAliveTimeout      60
     initTimeout             60
     retryTimeout            0
     respBuffer              0
   }

   context / {
     type                    proxy
     handler                 nodejs
     addDefaultCharset       off
   }

   context /.well-known/acme-challenge {
     location                /var/www/yourdomain.com/public_html/.well-known/acme-challenge
     allowBrowse             1
   }
   ```

4. Create necessary directories for SSL verification:
   ```bash
   mkdir -p /var/www/yourdomain.com/public_html/.well-known/acme-challenge
   chmod -R 755 /var/www/yourdomain.com/public_html
   ```

5. Restart OpenLiteSpeed:
   ```bash
   /usr/local/lsws/bin/lswsctrl restart
   ```

### 7. Issue SSL Certificate
Use CyberPanel's SSL section to issue an SSL certificate for your domain.

### 8. Monitoring and Maintenance

- View logs: `pm2 logs reactstarter`
- Restart application: `pm2 restart reactstarter`
- Check status: `pm2 status`
- Monitor resources: `pm2 monit`

## Troubleshooting (git check)

- If the site shows a 500 error, check OpenLiteSpeed error logs: `cat /usr/local/lsws/logs/error.log`
- Check Node.js application logs: `pm2 logs reactstarter`
- If SSL shows as untrusted, ensure you're using Let's Encrypt production certificates, not self-signed or staging ones 

### Cursor Commands To add repo in github
### 1. git status
### 2. git add . 
### 3. git commit -m "massage / note"
### 4. git push origin main

### Console commands To fetch in vps in folder of attendance.echowkidar.in
### 1. pm2 stop all
### 2. git checkout main # or git checkout master
### 3. git pull origin main # or git pull origin master
### 4. npm install # or yarn install
### 5. npm run build # or yarn build
### 6. pm2 start ecosystem.config.cjs --force
### 7. pm2 logs reactstarter

### Windsurf Commands To add repo in GitHub branch
## git branch complete_ptoject
## git config --global core.autocrlf true
## git push origin complete_ptoject # Replace your-branch-name
## git branch
## git fetch origin
## git checkout -b complete_project origin/complete_project
## git add .
## git config --global user.email "echowkidar@gmail.com"
## git config --global user.name "echowkidar@gmail.com"
## git commit -m "complete project"
## git push origin complete_project


## Cursor
## git add .
## git commit -m "Your descriptive commit message"
## git checkout -b done # command does two things: -b done: Creates a new branch named "done" and checkout: Switches your current working branch to the newly created "done" branch.
## git push origin done # Push the new branch to GitHub:

### Console commands To fetch in vps in folder of attendance.echowkidar.in (if have any branch)
## git fetch origin
## git reset --hard origin/done
## git config --global core.autocrlf input
## git clean -fd
## pm2 stop all
## npm install # or yarn install
## npm run build # or yarn build
## pm2 start ecosystem.config.cjs --force