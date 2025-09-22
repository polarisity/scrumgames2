#!/bin/bash

# Simple Scrum Poker Server Setup Script
# This script prepares a Digital Ocean VPS for GitHub Actions deployment

set -e

echo "🚀 Setting up server for Scrum Poker deployment..."

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install Docker
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh

# Install Docker Compose
echo "🐳 Installing Docker Compose..."
DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep -oP '"tag_name": "\K(.*)(?=")')
curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Add current user to docker group (if not root)
if [ "$USER" != "root" ]; then
    echo "👤 Adding user to docker group..."
    usermod -aG docker $USER
fi

# Create deployment directory
echo "📁 Creating deployment directory..."
mkdir -p /opt/scrum-poker
chown -R $USER:$USER /opt/scrum-poker

# Configure basic firewall
echo "🔒 Configuring firewall..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload

# Install nginx for reverse proxy
echo "🌐 Installing nginx..."
apt install -y nginx curl
systemctl enable nginx
systemctl start nginx

# Create nginx config for the app
cat > /etc/nginx/sites-available/scrum-poker << EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable the nginx site
ln -sf /etc/nginx/sites-available/scrum-poker /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Create SSH key directory
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Create a simple health check script
cat > /opt/health-check.sh << 'EOF'
#!/bin/bash
if curl --fail --silent http://localhost:3000 > /dev/null; then
    echo "$(date): Scrum Poker is healthy" >> /var/log/scrum-poker-health.log
else
    echo "$(date): Scrum Poker is down - attempting restart" >> /var/log/scrum-poker-health.log
    cd /opt/scrum-poker && docker-compose restart scrum-poker
fi
EOF

chmod +x /opt/health-check.sh

# Add health check to crontab (check every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/health-check.sh") | crontab -

# Create swap file for small VPS
if [ ! -f /swapfile ]; then
    echo "💾 Creating 1GB swap file..."
    fallocate -l 1G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Display versions
echo "✅ Setup completed! Installed versions:"
echo "Docker: $(docker --version)"
echo "Docker Compose: $(docker-compose --version)"
echo "nginx: $(nginx -v 2>&1)"

echo ""
echo "🔑 NEXT STEPS:"
echo "1. Add your SSH public key to ~/.ssh/authorized_keys"
echo "2. Set up your GitHub repository secrets:"
echo "   - DO_SSH_PRIVATE_KEY: Your private SSH key"
echo "   - DO_SERVER_HOST: $(curl -s ifconfig.me)"
echo "   - DO_SSH_USER: $USER"
echo "3. Push your code to trigger the first deployment!"

echo ""
echo "📋 Server Information:"
echo "IP Address: $(curl -s ifconfig.me)"
echo "SSH Access: ssh $USER@$(curl -s ifconfig.me)"
echo "Web Access: http://$(curl -s ifconfig.me)"

echo ""
echo "🎉 Server setup complete! Ready for GitHub Actions deployment."
