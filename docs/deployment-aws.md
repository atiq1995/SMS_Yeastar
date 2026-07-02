# AWS EC2 deployment

Dedicated small EC2 instance in the client's existing AWS account. No Lightsail required.

## Checklist

### 1. AWS console (client or developer with EC2 access)

- [ ] Launch **Ubuntu 22.04 LTS** — `t4g.micro` (cheapest, ARM) or `t3.micro` (x86)
- [ ] **20 GB gp3** root volume (SQLite + logs)
- [ ] Use the client's existing **VPC** and a **public subnet**
- [ ] Attach or create a **security group** (see below)
- [ ] Allocate and attach an **Elastic IP** to the instance (this is the Yeastar whitelist IP)
- [ ] DNS **A record** → Elastic IP (e.g. `sms-api.tomspestcontrol.com.au`)

**Security group**

| Direction | Port | Source / dest |
|-----------|------|----------------|
| Inbound | 443 | `0.0.0.0/0` (HTTPS for ServiceM8) |
| Inbound | 22 | Your IP only (SSH) |
| Outbound | All | Default (ServiceM8 API + Yeastar at client site) |

No inbound port 3000 — Caddy terminates HTTPS and proxies locally.

### 2. Bootstrap the server

SSH in, then run (or pipe) the bootstrap script:

```bash
export REPO_URL="https://github.com/your-org/toms-sms.git"   # or scp the repo
bash scripts/deploy-ec2.sh
```

Or manually:

```bash
sudo apt-get update -y
sudo apt-get install -y git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

sudo mkdir -p /opt/toms-sms
sudo chown "$USER:$USER" /opt/toms-sms
git clone "$REPO_URL" /opt/toms-sms
cd /opt/toms-sms
npm install
npm run db:migrate
npm run build
```

`build-essential` is required on ARM (`t4g.micro`) so `better-sqlite3` compiles.

### 3. Configure `.env`

```bash
cd /opt/toms-sms
cp .env.example .env
nano .env
```

| Variable | Production value |
|----------|------------------|
| `APP_ENV` | `production` |
| `APP_URL` | `https://sms-api.tomspestcontrol.com.au` |
| `SERVICEM8_REDIRECT_URI` | `https://sms-api.tomspestcontrol.com.au/oauth/callback` |
| `DATABASE_PATH` | `/opt/toms-sms/data/sms.db` |
| `YEASTAR_*` | Router public IP + port-forwards (see [yeastar-setup.md](yeastar-setup.md)) |
| `YEASTAR_SEND_ENABLED` | `false` until UAT passes |

Create the data directory:

```bash
mkdir -p /opt/toms-sms/data
```

### 4. HTTPS with Caddy

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

Replace the hostname in `/etc/caddy/Caddyfile`:

```
sms-api.tomspestcontrol.com.au {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

Caddy obtains a Let's Encrypt certificate automatically once DNS points at the Elastic IP.

### 5. Run the app with systemd

```bash
sudo tee /etc/systemd/system/toms-sms.service <<'EOF'
[Unit]
Description=Tom's Pest Control SMS Dashboard
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/toms-sms
EnvironmentFile=/opt/toms-sms/.env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Adjust `User=` if not using the default `ubuntu` user.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now toms-sms
sudo systemctl status toms-sms
```

### 6. Post-deploy

- [ ] `curl -s https://sms-api.tomspestcontrol.com.au/health` returns OK
- [ ] Yeastar **API Settings → IP restriction**: allow **only** the EC2 **Elastic IP**
- [ ] ServiceM8 add-on callback URL = `https://sms-api.tomspestcontrol.com.au`
- [ ] Dashboard **Test Yeastar** succeeds, then set `YEASTAR_SEND_ENABLED=true`

## Updates

```bash
cd /opt/toms-sms
git pull
npm install
npm run db:migrate
npm run build
sudo systemctl restart toms-sms
```

## Cost note

A dedicated `t4g.micro` is typically ~$6–8/month plus EBS. Free tier may cover a micro if hours remain; many accounts with existing EC2 instances are already past the 750 h/month allowance.
