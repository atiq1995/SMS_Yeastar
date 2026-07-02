# Tom's Pest Control — SMS Dashboard

AI coding context for this repository.

## Purpose

ServiceM8 iframe add-on + AWS-hosted backend that sends/receives SMS via the client's **Yeastar TG400**, with automated job-lifecycle messages and a management dashboard.

## Architecture

```
ServiceM8 (cloud) ──HTTPS──► AWS EC2 (this app) ──Elastic IP + port-forward──► Yeastar TG400
```

- **No office PC.** Router + Yeastar stay on at client site.
- **No Cloudflare tunnel.** ServiceM8 calls AWS directly.
- Yeastar is reached via client router **static public IP** and port-forward rules.

## Non-negotiables

1. ServiceM8 webhooks are pointers only — **always fetch full job/company** from the API before sending SMS.
2. **Rate-limit Yeastar**: max 1 SMS per 10 seconds per SIM port.
3. Whitelist **only AWS IP** on Yeastar API Settings.
4. Never commit secrets — use `.env` on the server.
5. `YEASTAR_SEND_ENABLED=false` until UAT passes.

## Tech stack

- Node.js 20 + TypeScript + Express
- SQLite (`better-sqlite3`) on server disk
- Handlebars templates
- ServiceM8 web-service-hosted add-on (JWT callbacks + OAuth)
- Yeastar HTTP WebCGI (outbound) + TCP 5038 client (inbound)

## Key paths

| Path | Role |
|------|------|
| `src/server.ts` | HTTP entry, routes |
| `src/servicem8/addon-handler.ts` | JWT events → HTML/JSON |
| `src/yeastar/send.ts` | Outbound SMS |
| `src/yeastar/receive.ts` | Inbound TCP client |
| `src/engine/` | Rules + templates |
| `src/ui/` | Iframe dashboard HTML |
| `docs/router-port-forward.md` | Client router setup |
| `docs/deployment-aws.md` | EC2 deploy |

## Commands

```bash
npm install
npm run db:migrate
npm run dev          # local :3000
npm run build && npm start
```

## Reference only

Sibling project `d:\Project\Sms gateway` has earlier patterns — **this repo is canonical** for Tom's Pest Control.

## Ponytail

Prefer simplest working solution. No new abstractions unless requested. See `.cursor/rules/ponytail.mdc`.
