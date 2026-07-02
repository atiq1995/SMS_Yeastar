# Tom's Pest Control — SMS Dashboard

## Summary

Custom SMS platform embedded in **ServiceM8** as an add-on iframe. Staff manage templates, rules, logs, and inbox from **Add-ons → SMS Dashboard**. SMS is sent through the client's **Yeastar TG400** gateway; the app runs on **AWS**, connecting to the Yeastar via the office router's **static IP** and port forwarding.

## Goals

- Automatic SMS on job lifecycle events (created, status change, en route, completed)
- Manual "Send SMS" from job cards
- Outbound delivery log and inbound reply inbox
- Analytics and Yeastar connection testing
- No dedicated office computer running 24/7

## User flows

### Automatic SMS

1. Job event occurs in ServiceM8 (e.g. status → Completed)
2. ServiceM8 POSTs JWT to AWS callback URL
3. App fetches full job + customer from ServiceM8 API
4. Rules engine picks template → renders message → queues send
5. Yeastar HTTP API sends SMS; result logged in dashboard

### Manual send

1. Staff open job → **Send SMS** action
2. Preview message → confirm send
3. Same Yeastar path as automatic

### Inbound reply

1. Customer texts back → TG400 receives on SIM
2. AWS TCP client on port 5038 gets SMS event
3. Message appears in **Inbox**; matched to job by phone number

## Architecture

```
ServiceM8 ──HTTPS──► AWS (Express + SQLite)
                          │
                          ├── HTTP :8080 ──► Router ──► Yeastar (send)
                          └── TCP  :5038 ──► Router ──► Yeastar (receive)
```

## Setup checklist

### AWS

1. Lightsail instance + static IP
2. DNS → HTTPS (Caddy)
3. Deploy app, configure `.env`
4. ServiceM8 Developer: callback URL = your HTTPS URL
5. Activate add-on on client account

### Router + Yeastar

See [docs/router-port-forward.md](docs/router-port-forward.md)

1. Port-forward HTTP and TCP 5038 to Yeastar LAN IP
2. Yeastar API Settings → permit **only** AWS IP
3. Test connection from dashboard Settings tab
4. Enable `YEASTAR_SEND_ENABLED=true` after UAT

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Dashboard blank in ServiceM8 | Callback URL HTTPS? OAuth completed? |
| Test connection fails | Port-forward rules, Yeastar IP whitelist, static IP correct |
| SMS not sending | `YEASTAR_SEND_ENABLED`, credentials, rate limit queue |
| No inbound messages | TCP 5038 forward, AWS receive client running |
| OAuth expired | Reconnect via Settings or `/oauth/activate` |

## Docs

- [ServiceM8 setup](docs/servicem8-setup.md)
- [Yeastar setup](docs/yeastar-setup.md)
- [Router port-forward](docs/router-port-forward.md)
- [AWS deployment](docs/deployment-aws.md)
