#!/usr/bin/env bash
# =============================================================================
# bootstrap-instance.sh — Set up a fresh Ubuntu AWS instance for JudgeKit
#
# Installs Docker, configures swap, and optionally sets up Nginx + SSL.
# Idempotent — safe to run multiple times on the same host.
#
# Usage:
#   ./scripts/bootstrap-instance.sh \
#     [--ssh-user=ubuntu] \
#     [--swap=8G] \
#     [--nginx] \
#     [--email=admin@example.com]
#
# Phases (each idempotent):
#   1. Swap file creation + swappiness tuning
#   2. Docker CE installation (official repo) + compose plugin
#   3. Nginx installation (--nginx flag)
#   4. Certbot + Let's Encrypt SSL (--certbot --domain=<dom>)
#   5. Create /judge-workspaces directory
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
SSH_USER="ubuntu"
SWAP_SIZE="8G"
INSTALL_NGINX=false
INSTALL_CERTBOT=false
DOMAIN=""
EMAIL=""

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --host=*)       HOST="${arg#*=}" ;;
    --ssh-key=*)    SSH_KEY="${arg#*=}" ;;
    --ssh-user=*)   SSH_USER="${arg#*=}" ;;
    --swap=*)       SWAP_SIZE="${arg#*=}" ;;
    --nginx)        INSTALL_NGINX=true ;;
    --certbot)      INSTALL_CERTBOT=true ;;
    --domain=*)     DOMAIN="${arg#*=}" ;;
    --email=*)      EMAIL="${arg#*=}" ;;
    --help|-h)
      echo "Usage: $0 --host=<ip> --ssh-key=<key> [--ssh-user=ubuntu] [--swap=8G] [--nginx] [--certbot --domain=<dom>] [--email=<email>]"
      exit 0
      ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

if [[ -z "${HOST:-}" ]]; then
  echo "Error: --host is required" >&2; exit 1
fi
if [[ -z "${SSH_KEY:-}" ]]; then
  echo "Error: --ssh-key is required" >&2; exit 1
fi
if [[ "${INSTALL_CERTBOT}" == "true" && -z "${DOMAIN}" ]]; then
  echo "Error: --domain is required when using --certbot" >&2; exit 1
fi

# Expand tilde in SSH_KEY
SSH_KEY="${SSH_KEY/#\~/$HOME}"

if [[ ! -f "${SSH_KEY}" ]]; then
  echo "Error: SSH key not found: ${SSH_KEY}" >&2; exit 1
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[BOOTSTRAP]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o LogLevel=ERROR -i ${SSH_KEY}"
REMOTE="${SSH_USER}@${HOST}"

remote() {
  ssh $SSH_OPTS "${REMOTE}" "$@"
}

remote_sudo() {
  ssh $SSH_OPTS "${REMOTE}" "sudo bash -c $(printf '%q' "$1")"
}

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
info "Connecting to ${HOST} as ${SSH_USER}..."
remote "echo ok" >/dev/null 2>&1 || die "Cannot SSH to ${REMOTE}"
success "SSH connection verified"

REMOTE_ARCH=$(remote "uname -m")
REMOTE_OS=$(remote "lsb_release -cs 2>/dev/null || echo unknown")
info "Remote: ${REMOTE_ARCH}, Ubuntu ${REMOTE_OS}"

# ---------------------------------------------------------------------------
# Step 1: Swap
# ---------------------------------------------------------------------------
info "Setting up ${SWAP_SIZE} swap..."

remote_sudo "
set -e
if swapon --show | grep -q /swapfile; then
    echo 'Swap already active — skipping creation'
else
    if [ -f /swapfile ]; then
        echo 'Swapfile exists but not active — activating'
    else
        echo 'Creating ${SWAP_SIZE} swapfile...'
        fallocate -l ${SWAP_SIZE} /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=\$(echo ${SWAP_SIZE} | sed 's/G//' | awk '{print \$1 * 1024}')
        chmod 600 /swapfile
        mkswap /swapfile
    fi
    swapon /swapfile
fi

# Persist in fstab
if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Tune swappiness (low = prefer RAM, only swap under pressure)
sysctl -w vm.swappiness=10 >/dev/null
if [ -d /etc/sysctl.d ]; then
    echo 'vm.swappiness=10' > /etc/sysctl.d/99-judgekit-swap.conf
fi

# Tune vfs_cache_pressure (lower = keep dentries/inodes in cache longer)
sysctl -w vm.vfs_cache_pressure=50 >/dev/null
echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.d/99-judgekit-swap.conf 2>/dev/null || true

echo 'Swap summary:'
swapon --show
free -h | head -3
"
success "Swap configured (${SWAP_SIZE}, swappiness=10)"

# ---------------------------------------------------------------------------
# Step 2: Docker
# ---------------------------------------------------------------------------
info "Installing Docker CE..."

remote_sudo "
set -e
if command -v docker >/dev/null 2>&1; then
    echo 'Docker already installed:'
    docker --version
    echo 'Ensuring Docker is running...'
    systemctl enable --now docker
    # Ensure user is in docker group
    usermod -aG docker ${SSH_USER} 2>/dev/null || true
    exit 0
fi

echo 'Installing Docker prerequisites...'
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg >/dev/null

echo 'Adding Docker GPG key and repository...'
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

ARCH=\$(dpkg --print-architecture)
CODENAME=\$(. /etc/os-release && echo \"\$VERSION_CODENAME\")
echo \"deb [arch=\${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \${CODENAME} stable\" > /etc/apt/sources.list.d/docker.list

echo 'Installing Docker CE + Compose plugin...'
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null

echo 'Enabling Docker service...'
systemctl enable --now docker

echo 'Adding ${SSH_USER} to docker group...'
usermod -aG docker ${SSH_USER}

docker --version
docker compose version
"
success "Docker installed and running"

# ---------------------------------------------------------------------------
# Step 3: Nginx (optional)
# ---------------------------------------------------------------------------
if [[ "${INSTALL_NGINX}" == "true" ]]; then
    info "Installing Nginx..."
    remote_sudo "
set -e
if command -v nginx >/dev/null 2>&1; then
    echo 'Nginx already installed:'
    nginx -v 2>&1
    systemctl enable --now nginx
    exit 0
fi

apt-get update -qq
apt-get install -y -qq nginx >/dev/null
systemctl enable --now nginx

# Remove default site to avoid conflicts
rm -f /etc/nginx/sites-enabled/default

nginx -v 2>&1
"
    success "Nginx installed and running"
else
    info "Skipping Nginx installation (use --nginx to install)"
fi

# ---------------------------------------------------------------------------
# Step 4: Certbot + SSL (optional)
# ---------------------------------------------------------------------------
if [[ "${INSTALL_CERTBOT}" == "true" ]]; then
    info "Installing Certbot and obtaining SSL certificate for ${DOMAIN}..."

    EMAIL_FLAG="--register-unsafely-without-email"
    if [[ -n "${EMAIL}" ]]; then
        EMAIL_FLAG="--email ${EMAIL}"
    fi

    remote_sudo "
set -e
if ! command -v certbot >/dev/null 2>&1; then
    echo 'Installing Certbot...'
    apt-get update -qq
    apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
fi

# Check if cert already exists
if [ -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ]; then
    echo 'Certificate already exists for ${DOMAIN} — skipping'
    certbot certificates -d ${DOMAIN} 2>/dev/null | grep -E 'Expiry|Domains' || true
    exit 0
fi

echo 'Requesting certificate for ${DOMAIN}...'
# Use --nginx plugin since Nginx is already installed and binding port 80.
# Falls back to --standalone (with Nginx stopped) if the plugin fails.
if certbot --nginx \
    -d ${DOMAIN} \
    --non-interactive \
    --agree-tos \
    ${EMAIL_FLAG} \
    --redirect 2>/dev/null; then
    echo 'Certificate obtained via nginx plugin'
else
    echo 'Nginx plugin failed — trying standalone (stopping Nginx temporarily)...'
    systemctl stop nginx || true
    certbot certonly --standalone \
        -d ${DOMAIN} \
        --non-interactive \
        --agree-tos \
        ${EMAIL_FLAG} \
        --preferred-challenges http
    systemctl start nginx
fi

# Set up auto-renewal timer
systemctl enable --now certbot.timer 2>/dev/null || true

echo 'Certificate obtained:'
certbot certificates -d ${DOMAIN} 2>/dev/null | grep -E 'Expiry|Domains' || true

# Generate dhparam if missing (used by nginx SSL config)
if [ ! -f /etc/letsencrypt/ssl-dhparams.pem ]; then
    echo 'Generating DH parameters (this takes a moment)...'
    openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
fi

# Create options-ssl-nginx.conf if missing
if [ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]; then
    cat > /etc/letsencrypt/options-ssl-nginx.conf <<'SSLEOF'
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers \"ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384\";
SSLEOF
fi
"
    success "SSL certificate obtained for ${DOMAIN}"
else
    info "Skipping Certbot (use --certbot --domain=<dom> to install)"
fi

# ---------------------------------------------------------------------------
# Step 5: Create /judge-workspaces
# ---------------------------------------------------------------------------
info "Creating /judge-workspaces directory..."
remote_sudo "mkdir -p /judge-workspaces && chmod 755 /judge-workspaces"
success "/judge-workspaces ready"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "==========================================================================="
success "Bootstrap complete for ${HOST}"
echo "==========================================================================="
info "Architecture: ${REMOTE_ARCH}"
info "Swap:         ${SWAP_SIZE} (swappiness=10)"
info "Docker:       $(remote 'docker --version 2>/dev/null' | head -1)"
[[ "${INSTALL_NGINX}" == "true" ]] && info "Nginx:        installed"
[[ "${INSTALL_CERTBOT}" == "true" ]] && info "SSL:          ${DOMAIN}"
echo "==========================================================================="
