# Simple GitHub Actions Deployment Guide

This is a streamlined guide for deploying your Scrum Poker game to Digital Ocean using GitHub Actions - no testing, no notifications, just simple deployment.

## 🎯 What This Does

- ✅ Builds your Docker image when you push code
- ✅ Deploys automatically to your Digital Ocean VPS  
- ✅ Provides basic health checking
- ✅ Creates automatic backups before each deployment
- ✅ Simple one-file workflow

## 🚀 Quick Setup (5 Minutes)

### Step 1: Prepare Your VPS

```bash
# SSH into your Digital Ocean VPS
ssh root@your-server-ip

# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/yourusername/scrum-poker/main/setup-simple.sh | bash
```

Or manually copy the `setup-simple.sh` script:

```bash
# Copy setup script to your VPS
scp setup-simple.sh root@your-server-ip:/tmp/

# SSH and run it
ssh root@your-server-ip
chmod +x /tmp/setup-simple.sh
/tmp/setup-simple.sh
```

### Step 2: Set Up SSH Keys

Generate an SSH key pair for deployment:

```bash
# On your local machine
ssh-keygen -t rsa -b 4096 -f ~/.ssh/scrum_poker_deploy

# Copy public key to your VPS
ssh-copy-id -i ~/.ssh/scrum_poker_deploy.pub root@your-server-ip
```

### Step 3: Configure GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add these 3 secrets:

```
Name: DO_SSH_PRIVATE_KEY
Value: [Copy content of ~/.ssh/scrum_poker_deploy]

Name: DO_SERVER_HOST  
Value: [Your VPS IP address]

Name: DO_SSH_USER
Value: root
```

### Step 4: Add Workflow File

Create `.github/workflows/deploy.yml` in your repository with the simple deployment workflow.

### Step 5: Deploy!

```bash
# Push your code to trigger deployment
git add .
git commit -m "Add simple GitHub Actions deployment"
git push origin main
```

That's it! 🎉

## 📁 Required Files

Make sure your repository has these files:

```
your-repo/
├── server.js              # Your main server file
├── public/
│   └── index.html         # Your client-side app  
├── package.json           # Dependencies
├── Dockerfile            # Container config
├── docker-compose.yml    # Orchestration
├── .dockerignore         # Build optimization
└── .github/
    └── workflows/
        └── deploy.yml    # Deployment workflow
```

## 🔍 How It Works

1. **Push code** to `main` branch
2. **GitHub Actions** builds Docker image  
3. **Copies files** to your VPS via SSH
4. **Backs up** current deployment
5. **Deploys** new version with Docker Compose
6. **Health check** ensures it's working
7. **Done!** Your app is live

## 📊 Monitoring Your App

### Check Deployment Status
- Go to your GitHub repository → **Actions** tab
- Watch the deployment progress in real-time

### View Application Logs
```bash
# SSH to your server
ssh root@your-server-ip

# View app logs
cd /opt/scrum-poker
docker-compose logs -f scrum-poker
```

### Check App Status
```bash
# Check if containers are running
docker-compose ps

# Test the app
curl http://localhost:3000
```

### Manual Operations
```bash
# Restart the app
docker-compose restart

# Rebuild and restart  
docker-compose up -d --build

# Stop the app
docker-compose down

# View recent logs
docker-compose logs --tail=50 scrum-poker
```

## 🔧 Troubleshooting

### Deployment Failed?
1. Check GitHub Actions logs for errors
2. Verify your secrets are correct
3. Make sure your VPS is accessible via SSH

### App Not Loading?  
```bash
# Check if containers are running
docker-compose ps

# Check logs for errors
docker-compose logs scrum-poker

# Check nginx status
systemctl status nginx

# Test direct app access (bypass nginx)
curl http://localhost:3000
```

### SSH Issues?
```bash
# Test SSH connection manually
ssh -i ~/.ssh/scrum_poker_deploy root@your-server-ip

# Check key permissions
chmod 600 ~/.ssh/scrum_poker_deploy
```

## 🎮 Using Your App

Once deployed, your Scrum Poker game will be available at:
- **http://your-server-ip** (through nginx proxy)
- Multiple players can join and play estimation games
- Real-time interaction with throwing items and animations

## ⚡ Quick Commands Reference

```bash
# Deploy manually (emergency)
ssh root@your-server-ip
cd /opt/scrum-poker
git pull  # if you set up git on server
docker-compose up -d --build

# View live logs
docker-compose logs -f

# Restart everything
docker-compose restart

# Check health
curl http://localhost:3000

# View backups
ls -la /opt/scrum-poker-backup-*
```

## 🔄 Making Updates

Just push to your main branch - deployment happens automatically:

```bash
# Make changes to your code
vim server.js

# Commit and push
git add .
git commit -m "Update game features" 
git push origin main

# GitHub Actions will deploy automatically!
```

## 💡 Tips

1. **Monitor the first deployment** - watch GitHub Actions to make sure everything works
2. **Bookmark your server IP** - that's where your game will be accessible  
3. **Check logs if issues arise** - most problems are visible in the Docker logs
4. **Backups are automatic** - each deployment creates a backup of the previous version
5. **Health checks run every 5 minutes** - the app will auto-restart if it goes down

Your Scrum Poker game now has professional automated deployment with just the essentials! 🚀
