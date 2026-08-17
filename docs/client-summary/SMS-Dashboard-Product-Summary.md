# SMS Dashboard — Product Summary (for clients / partners)

**One-liner:** A ServiceM8 add-on that sends and receives SMS through the client’s Yeastar TG400 — automatic job updates plus manual send, with a full inbox and delivery log.

---

## What it is

A cloud-hosted SMS platform embedded inside **ServiceM8**. Staff open **Add-ons → SMS Dashboard** to manage templates, automation rules, logs, and customer replies. Messages go out through the client’s own **Yeastar TG400** (their SIMs / their numbers). No dedicated office PC needs to run 24/7.

## What customers get

| Feature | Benefit |
|--------|---------|
| Automatic SMS on job events | Booking confirmed, tech en route, job completed, status changes |
| Manual **Send SMS** on jobs | Preview + send without leaving ServiceM8 |
| Two-way **Inbox** | Customer replies matched to jobs by phone number |
| Outbound **Log** + analytics | Audit trail and 7-day volume |
| Settings + gateway test | Confirm Yeastar connectivity before go-live |

## How it works (sales level)

1. Something happens on a job in ServiceM8 (or staff click Send SMS).
2. The cloud app loads the full job and customer details.
3. The right template is used and the message is sent via Yeastar.
4. If the customer replies, it appears in the Inbox.

```
ServiceM8  →  Cloud app (AWS)  →  Office router  →  Yeastar TG400
```

## Ideal buyer

- Already on ServiceM8 (or buying ServiceM8)
- Has or will buy a Yeastar TG400
- Wants SMS from their own numbers, not a shared SaaS sender
- Doesn’t want an office PC left on for SMS

## What the site needs

- ServiceM8 account  
- Yeastar TG400 + SIMs  
- Router with static public IP + port forwards  
- Domain for HTTPS in production  

## Suggested pitch line

> Keep customers informed automatically — booking confirmed, tech on the way, job done — using your own SMS hardware, without leaving ServiceM8.

## Deliverables in this pack

- `SMS-Dashboard-Product-Summary.pdf` — shareable brochure with demo screenshots  
- `SMS-Dashboard-Product-Summary.html` — same content (editable)  
- `screenshots/` — Overview, Rules, Inbox, Send SMS demos  

---

*Demo images use sample data for illustration.*
