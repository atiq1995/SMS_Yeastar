#!/usr/bin/env bash
# Ubuntu bootstrap for EC2 (t4g.micro / t3.micro). Run after SSH login.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/toms-sms}"
REPO_URL="${REPO_URL:-}"

sudo apt-get update -y
sudo apt-get install -y git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"
if [ -n "$REPO_URL" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
npm install
npm run db:migrate
npm run build
echo "Deploy files ready. Configure .env, Caddy, and systemd — see docs/deployment-aws.md"
