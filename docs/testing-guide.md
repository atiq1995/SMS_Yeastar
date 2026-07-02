# SMS Dashboard — full testing guide

Step-by-step instructions to deploy and test this app with ServiceM8 and Yeastar TG400.

**You do not need a client-owned domain to start.** Use a temporary `sslip.io` hostname for HTTPS until the client provides DNS. You can complete Yeastar testing before ServiceM8 credentials arrive.

---

## Overview — what happens in what order

| Phase | What | Needs client domain? | Needs ServiceM8 keys? |
|-------|------|----------------------|------------------------|
| 1 | EC2 server + Elastic IP | No | No |
| 2 | Deploy app + HTTPS (`sslip.io`) | No (temporary hostname) | No |
| 3 | Test Yeastar send/receive | No (client whitelists EC2 IP) | No |
| 4 | ServiceM8 add-on setup | Yes (HTTPS URL) | Yes (after Save) |
| 5 | Install add-on + OAuth | Yes | Yes |
| 6 | End-to-end test in ServiceM8 | Yes | Yes |
| 7 | Swap to real domain (production) | Client DNS | Already have keys |

---

## What to ask the client (send this while you work)

Copy and send:

```
To complete SMS dashboard testing I need:

1. Yeastar: whitelist our EC2 Elastic IP in TG400 → API Settings → IP restriction
   (I will send the IP once the server is running)

2. ServiceM8: after I save the add-on, please send App ID + App Secret
   (shown on the Store Connect page after saving the add-on)
   OR give me Developer portal access

3. DNS (for production — can wait for UAT):
   sms-api.yoursite.com.au → A record → [EC2 Elastic IP]

4. ServiceM8: open the private install link on your account when I send it,
   OR give me a test login to install the add-on
```

---

## Phase 1 — Create EC2 server

### 1.1 Launch instance (AWS Console)

1. Go to **EC2 → Instances → Launch instance**.
2. **Name:** `toms-sms`
3. **AMI:** Ubuntu Server 22.04 LTS
4. **Instance type:** `t3.micro` (x86) or `t4g.micro` (ARM, cheaper — needs `build-essential` for SQLite)
5. **Key pair:** create or select one (download `.pem` — you need it for SSH)
6. **Network:** use the account’s existing VPC and a **public subnet**
7. **Auto-assign public IP:** Enable
8. **Storage:** 20 GB gp3
9. **Security group:** create new (see below)
10. Launch

### 1.2 Security group rules

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| SSH | 22 | **Your IP only** | Admin access |
| HTTPS | 443 | `0.0.0.0/0` | ServiceM8 callbacks |
| Custom TCP | 3000 | **Your IP only** (optional) | Direct health check before Caddy — remove later |

Do **not** expose port 3000 to the internet in production. Caddy on 443 proxies to localhost:3000.

### 1.3 Elastic IP (required for Yeastar whitelist)

1. **EC2 → Elastic IPs → Allocate**
2. **Actions → Associate** with your `toms-sms` instance
3. **Write down this IP** — e.g. `203.0.113.50` (yours will differ)

This Elastic IP is what the client must whitelist on the Yeastar. It does not change when you stop/start the instance (unlike the default public IP).

### 1.4 SSH into the server

From your PC (PowerShell or Git Bash):

```bash
ssh -i "path\to\your-key.pem" ubuntu@YOUR_ELASTIC_IP
```

If `ubuntu` fails, try `ec2-user` or check the AMI default user.

---

## Phase 2 — Deploy the application

### 2.1 Copy the project to EC2

**Option A — Git (if repo is on GitHub):**

```bash
export REPO_URL="https://github.com/YOUR_ORG/toms-sms.git"
bash -c "$(curl -fsSL $REPO_URL/raw/main/scripts/deploy-ec2.sh)" 
```

Or clone manually:

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

**Option B — SCP from your Windows machine:**

```powershell
scp -i "path\to\key.pem" -r "d:\Project\Toms pest control\SMS\*" ubuntu@YOUR_ELASTIC_IP:/opt/toms-sms/
```

Then SSH in and run `npm install`, `npm run db:migrate`, `npm run build`.

### 2.2 Create data directory

```bash
mkdir -p /opt/toms-sms/data
```

### 2.3 Configure `.env`

```bash
cd /opt/toms-sms
cp .env.example .env
nano .env
```

Fill in (replace placeholders):

```env
APP_ENV=production
PORT=3000
APP_URL=https://YOUR-ELASTIC-IP-DASHED.sslip.io
DATABASE_PATH=/opt/toms-sms/data/sms.db

SERVICEM8_APP_ID=
SERVICEM8_APP_SECRET=
SERVICEM8_REDIRECT_URI=https://YOUR-ELASTIC-IP-DASHED.sslip.io/oauth/callback

YEASTAR_HOST=203.63.75.15
YEASTAR_HTTP_PORT=48765
YEASTAR_API_PORT=5038
YEASTAR_USERNAME=apiuser
YEASTAR_PASSWORD=your-yeastar-password
YEASTAR_SIM_PORT=1
YEASTAR_SEND_ENABLED=false
YEASTAR_RECEIVE_ENABLED=true
```

**sslip.io hostname:** if Elastic IP is `203.0.113.50`, use `203-0-113-50.sslip.io` (dots → dashes, add `.sslip.io`).

Leave ServiceM8 ID/secret empty until Phase 4.

### 2.4 Install Caddy (HTTPS)

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

Edit Caddyfile (use your sslip.io hostname):

```bash
sudo nano /etc/caddy/Caddyfile
```

```
203-0-113-50.sslip.io {
    reverse_proxy localhost:3000
}
```

Reload:

```bash
sudo systemctl reload caddy
```

Caddy will request a Let's Encrypt certificate automatically. Wait ~30 seconds, then test:

```bash
curl -s https://203-0-113-50.sslip.io/health
```

Expected: `{"ok":true,"env":"production"}`

If certificate fails, check: security group allows 443, hostname matches Elastic IP (test with `ping 203-0-113-50.sslip.io`).

### 2.5 Run app with systemd (keeps running after logout)

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

sudo systemctl daemon-reload
sudo systemctl enable --now toms-sms
sudo systemctl status toms-sms
```

Check logs:

```bash
journalctl -u toms-sms -f
```

You should see `listening 3000` and ideally `yeastar tcp connected` (after client whitelists IP).

---

## Phase 3 — Test Yeastar (no ServiceM8 needed)

### 3.1 Client action: whitelist EC2 Elastic IP

Send the client your **Elastic IP** (not the office `203.63.75.15`).

On Yeastar TG400: **API Settings → IP restriction → allow only that IP**.

### 3.2 Test outbound SMS from EC2

SSH into EC2:

```bash
curl -v "http://203.63.75.15:48765/cgi/WebCGI?1500101=account&username=apiuser&password=YOURPASS&port=1&destination=61449628057&message=Test+from+EC2"
```

- **Success:** SMS arrives on the phone; curl returns OK/200-style response from Yeastar.
- **Fail:** timeout → port-forward or firewall; 403 → IP not whitelisted; auth error → wrong credentials.

### 3.3 Enable real sending in the app

After curl works:

```bash
nano /opt/toms-sms/.env
# Set YEASTAR_SEND_ENABLED=true
sudo systemctl restart toms-sms
```

### 3.4 Test inbound (optional)

1. Confirm logs show `yeastar tcp connected 203.63.75.15 5038`.
2. Text the Yeastar SIM number from your mobile.
3. Check logs for `inbound sms` and verify row in DB:

```bash
sqlite3 /opt/toms-sms/data/sms.db "SELECT * FROM inbound_messages ORDER BY id DESC LIMIT 5;"
```

If TCP never connects: check `5038` port-forward on office router and Yeastar whitelist.

---

## Phase 4 — ServiceM8 add-on setup

ServiceM8 requires **HTTPS**. Use your `sslip.io` URL until the client provides a real domain.

### 4.1 Add-on type

In **Developer → Store Connect → Add/Edit Item**:

| Field | Value |
|-------|--------|
| **Addon Type** | **Self-Hosted Web Service Function** |
| **Addon Manifest** | Upload `manifest.json` from this repo |
| **Callback URL** | `https://203-0-113-50.sslip.io/addon` |
| **Addon Activation URL** | `https://203-0-113-50.sslip.io/oauth/activate` |

Click **Save**.

### 4.2 App ID and App Secret

They appear **after Save**, on the same Store Connect page (scroll down). If missing:

- Refresh the page
- Ensure manifest uploaded and URLs saved
- Ask client to check their Developer account

Copy into EC2 `.env`:

```env
SERVICEM8_APP_ID=paste-here
SERVICEM8_APP_SECRET=paste-here
```

Restart:

```bash
sudo systemctl restart toms-sms
```

### 4.3 Private install URL

On the add-on page, copy **Private Add-on Install URL**, e.g.:

```
https://go.servicem8.com/addon_install?uuid=9b692112-7212-4782-8f41-2461cabb994b
```

Open while logged into the **client’s ServiceM8 account** (or send link to client).

---

## Phase 5 — OAuth connection

### 5.1 Install add-on

1. Open private install URL in browser (logged into ServiceM8).
2. Click install / activate.
3. You may be redirected to `https://.../oauth/activate` → ServiceM8 login/consent → `oauth/callback`.
4. Success page: *"OAuth connected. You can close this window..."*

### 5.2 Verify OAuth in database

On EC2:

```bash
sqlite3 /opt/toms-sms/data/sms.db "SELECT account_uuid, expires_at FROM oauth_tokens;"
```

Should show at least one row.

### 5.3 Reconnect if OAuth expires later

Browser: `https://203-0-113-50.sslip.io/oauth/activate?account_uuid=ACCOUNT_UUID`

Or use **Settings → Reconnect OAuth** in the dashboard (after Phase 6).

---

## Phase 6 — Test inside ServiceM8

### 6.1 Open dashboard

1. In ServiceM8: **Add-ons → SMS Dashboard**
2. Iframe should load with tabs: Overview, Rules, Templates, Log, Inbox, Analytics, Settings

If blank or error:

| Symptom | Check |
|---------|--------|
| Blank iframe | Callback URL correct? HTTPS works? `journalctl -u toms-sms` |
| 401 errors | App Secret in `.env` matches Store Connect |
| OAuth error | Complete Phase 5 again |

### 6.2 Test Yeastar from dashboard

1. **Settings** tab → **Test Yeastar**
2. With `YEASTAR_SEND_ENABLED=true`, should send a test SMS (destination is a dummy number in code — check response JSON in Settings output)

### 6.3 Manual Send SMS from a job

1. Open any job with a customer mobile number
2. **Actions → Send SMS**
3. Confirm send → check phone and **Log** tab in dashboard

### 6.4 Automatic SMS (webhook)

1. **Rules** tab — ensure at least one rule is enabled (default JSON after migrate)
2. **Templates** tab — edit message body if needed, Save
3. In ServiceM8, change a job **status** (e.g. to Completed)
4. Within ~30 seconds, SMS should send; check **Log** tab

Webhook flow: ServiceM8 POST → `/addon` → fetch full job from API → rules engine → Yeastar queue (10 s between sends).

### 6.5 Inbound reply

1. Reply to an SMS from your phone
2. **Inbox** tab should show the message (requires TCP 5038 + `yeastar tcp connected` in logs)

---

## Phase 7 — When client provides a real domain

Example: `sms-api.tomspestcontrol.com.au`

1. Client creates **A record** → your EC2 Elastic IP
2. Update Caddyfile hostname
3. Update `.env`: `APP_URL`, `SERVICEM8_REDIRECT_URI`
4. Update ServiceM8 Store Connect: Callback URL + Activation URL
5. `sudo systemctl reload caddy && sudo systemctl restart toms-sms`
6. Re-run OAuth install if redirect URI changed

---

## Phase 8 — Go live checklist

- [ ] Real domain + HTTPS (replace sslip.io)
- [ ] Yeastar whitelist = EC2 Elastic IP only
- [ ] `YEASTAR_SEND_ENABLED=true`
- [ ] ServiceM8 App ID/Secret in `.env`
- [ ] OAuth connected for client account
- [ ] Dashboard loads in ServiceM8
- [ ] Manual send works from job card
- [ ] Status change triggers automatic SMS
- [ ] Inbound reply appears in Inbox (if required)
- [ ] Nightly backup of `/opt/toms-sms/data/sms.db` (optional: cron + S3)

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| `curl` to Yeastar times out | Port-forward or firewall | Check router `48765→:80`, `5038→:5038` |
| Yeastar 403 / rejected | IP not whitelisted | Add EC2 Elastic IP on TG400 |
| `/health` fails on HTTPS | Caddy or SG | Open 443; check Caddyfile hostname |
| Let's Encrypt fails on sslip.io | Wrong IP in hostname | Dashes must match Elastic IP |
| Dashboard blank | Callback URL mismatch | Must end with `/addon`, HTTPS |
| `no_oauth` on send | OAuth not done | Phase 5 |
| `unknown_event` | Manifest vs handler | Re-upload `manifest.json` |
| Webhook no SMS | Rules off or no mobile | Check Rules, customer mobile in ServiceM8 |
| No inbox | TCP not connected | Whitelist IP, port 5038 forward, check logs |
| SMS dry-run only | Send disabled | `YEASTAR_SEND_ENABLED=true` |

### Useful commands on EC2

```bash
# App status
sudo systemctl status toms-sms

# Live logs
journalctl -u toms-sms -f

# Health
curl -s https://YOUR-HOST.sslip.io/health

# Recent outbound SMS
sqlite3 /opt/toms-sms/data/sms.db "SELECT id, to_number, status, created_at FROM outbound_messages ORDER BY id DESC LIMIT 10;"
```

---

## Local development (your PC) — limits

You can run `npm run dev` on Windows for code changes, but **ServiceM8 cannot call localhost**. Local dev is only for:

- Editing UI/templates
- Unit-style manual tests without ServiceM8 iframe

For ServiceM8 integration testing, use EC2 + `sslip.io` (or client domain).

---

## Quick reference — URLs and ports

| Item | Value |
|------|--------|
| Office router public IP | `203.63.75.15` |
| Yeastar HTTP (send) | `:48765` → Yeastar `:80` |
| Yeastar TCP (receive) | `:5038` |
| Yeastar LAN IP | `192.168.1.200` |
| App on EC2 | `localhost:3000` (internal) |
| Public HTTPS | `https://YOUR.sslip.io` |
| ServiceM8 callback | `https://YOUR.sslip.io/addon` |
| OAuth activate | `https://YOUR.sslip.io/oauth/activate` |
| OAuth callback | `https://YOUR.sslip.io/oauth/callback` |
| Health check | `https://YOUR.sslip.io/health` |

---

## Related docs

- [deployment-aws.md](deployment-aws.md) — EC2 production deployment
- [servicem8-setup.md](servicem8-setup.md) — add-on events reference
- [yeastar-setup.md](yeastar-setup.md) — TG400 API settings
- [router-port-forward.md](router-port-forward.md) — office router rules
