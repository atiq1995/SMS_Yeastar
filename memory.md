# Project memory

Persistent decisions and context. **No secrets here** — credentials live in server `.env` only.

## Client

- **Name:** Tom's Pest Control
- **Integration:** ServiceM8 add-on (iframe dashboard under Add-ons menu)
- **Hardware:** Yeastar TG400 (SMS already configured on device)

## Hosting (decided 2026-06-23)

| Decision | Choice |
|----------|--------|
| SMS app host | **AWS Lightsail** (always-on) |
| Office PC | **Not used** — client does not want a machine running 24/7 |
| Yeastar access | Client router **static public IP** + port-forward to TG400 |
| Tunnel (Cloudflare/ngrok) | **Not used** — AWS has public HTTPS URL |

## Network (fill in at setup)

| Item | Value |
|------|-------|
| Router static public IP | _TBD_ |
| Yeastar LAN IP | _TBD_ |
| External HTTP port → Yeastar :80 | _TBD_ (e.g. 8080) |
| External TCP port → Yeastar :5038 | 5038 |
| AWS Lightsail static IP | _TBD_ |
| Public app URL | _TBD_ (e.g. https://sms-api.example.com) |

## ServiceM8

- Add-on type: **Web Service Hosted**
- Menu: SMS Dashboard
- Job action: Send SMS
- Webhooks: job `status` changes (+ job created handling in worker)
- OAuth scopes: `read_jobs`, `read_customers`, `manage_customers`

## Automation triggers (default)

| Trigger | Typical status / event |
|---------|------------------------|
| Job created | New job webhook |
| Status changed | Per-status template mapping |
| Technician en route | Status = En Route / Dispatched (configurable) |
| Job completed | Status = Completed |

## Open questions

- Exact ServiceM8 status labels client uses for "en route" (map in Rules UI)
- Final domain name for AWS HTTPS URL
- SIM port count on TG400

## Changelog

- **2026-06-23:** Fresh build in `SMS/` workspace. AWS + static IP architecture. Replaced on-prem PC + tunnel plan.
