# Deployment Guide for AMU Salary Section

This document provides the necessary steps to deploy and configure the AMU Salary Section application in production.

## Environment Configuration

The application uses environment variables for configuration. In production, you'll need to set these properly.

### Required Environment Variables

Copy the `.env.production` file to your production server and rename it to `.env`. Then update the values with your actual production settings:

```bash
# Base URL for application (used for email links)
# THIS IS CRITICAL for password reset emails to work correctly
APP_URL=https://your-actual-production-domain.com

# Database settings
DB_HOST=your-production-db-host
DB_PORT=5432
DB_NAME=your_production_db_name
DB_USER=your_production_db_user
DB_PASSWORD=your_secure_production_password

# SMTP Settings for real emails
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false  # Set to true for port 465
SMTP_USER=your-email@your-domain.com
SMTP_PASS=your-smtp-password
SMTP_FROM="AMU Salary Section <your-email@your-domain.com>"
```

### Critical Settings for Password Reset

The most important setting for password reset functionality is `APP_URL`. This **must** be set to your actual production domain, including the protocol (http:// or https://). 

For example:
- If your site is hosted at `salary.amu.ac.in`, set `APP_URL=https://salary.amu.ac.in`
- If using a subdirectory, include it: `APP_URL=https://amu.ac.in/salary`

Without the correct `APP_URL`, password reset links in emails will point to non-existent domains.

## Building for Production

To create a production build:

```bash
# Install dependencies
npm install

# Build the client
npm run build

# Start the production server
npm start
```

## Email Configuration

The application sends emails for password reset functionality. In production, you'll need to configure a real SMTP service:

### Using Gmail SMTP

If using Gmail, you'll need to:
1. Create an "App Password" in your Google Account settings
2. Use that password in your `SMTP_PASS` environment variable

### Other SMTP Providers

You can use any SMTP provider by adjusting the settings accordingly:

- SendGrid: `SMTP_HOST=smtp.sendgrid.net`
- Mailgun: `SMTP_HOST=smtp.mailgun.org`
- Office 365: `SMTP_HOST=smtp.office365.com`

## SSL Configuration

For security, especially for features like password reset, we recommend using HTTPS in production.

If you're using a reverse proxy like Nginx or Apache, configure SSL there and point to the Node.js application.

## Troubleshooting

### Password Reset Links Not Working

If users report that password reset links in emails don't work:

1. Verify the `APP_URL` environment variable is correctly set to your production domain
2. Check that emails are being delivered (not in spam folders)
3. Ensure your server is accessible at the configured `APP_URL`
4. Check server logs for any errors in the password reset process

## Security Considerations

- Store your `.env` file securely and don't commit it to version control
- Use strong, unique passwords for database and SMTP accounts
- Keep your server up to date with security patches
- Consider adding rate limiting to prevent abuse of the password reset functionality

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
## git reset --hard origin/complete_project
## git config --global core.autocrlf input
## git clean -fd
## pm2 stop all
## npm install # or yarn install
## npm run build # or yarn build
## pm2 start ecosystem.config.cjs --force