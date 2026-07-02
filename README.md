# Tom's Pest Control — SMS Dashboard

ServiceM8 web-service-hosted add-on with an AWS-hosted Express + TypeScript backend. Outbound SMS via Yeastar TG400 HTTP API; inbound via TCP API (port 5038). SQLite stores settings, rules, templates, and message logs.

## Quick start

```bash
cp .env.example .env
# fill ServiceM8 + Yeastar values
npm install
npm run db:migrate
npm run dev
```

- Health: `GET /health`
- ServiceM8 add-on callback: `POST /addon` (raw JWT body)
- OAuth: `GET /oauth/activate` then `GET /oauth/callback`

## Docs

- [Testing guide](docs/testing-guide.md) — full UAT walkthrough (EC2, sslip.io, ServiceM8, Yeastar)
- [ServiceM8 setup](docs/servicem8-setup.md)
- [Yeastar setup](docs/yeastar-setup.md)
- [Router port-forward](docs/router-port-forward.md)
- [AWS deployment](docs/deployment-aws.md)

## Safety

Keep `YEASTAR_SEND_ENABLED=false` until UAT. Whitelist only the EC2 Elastic IP on the Yeastar API settings.
