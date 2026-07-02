# ServiceM8 add-on setup

For a full step-by-step testing walkthrough (EC2, temporary HTTPS without a client domain, Yeastar, OAuth), see **[testing-guide.md](testing-guide.md)**.

1. Create a **Self-Hosted Web Service Function** add-on in the ServiceM8 Developer portal (same as “Web Service Hosted” in API docs).
2. Upload `manifest.json` from this repo (menu **SMS Dashboard**, job action **Send SMS**, webhook `job.status`).
3. Set the callback URL to `https://YOUR_DOMAIN/addon` (must be HTTPS in production).
4. Copy **App ID** and **App Secret** into server `.env` (`SERVICEM8_APP_ID`, `SERVICEM8_APP_SECRET`).
5. Set `SERVICEM8_REDIRECT_URI` to `https://YOUR_DOMAIN/oauth/callback` and the same URI in the developer portal.
6. Install the add-on on the Tom's Pest Control account.
7. Open **Add-ons → SMS Dashboard** once, then visit **Settings → Reconnect OAuth** (or `/oauth/activate?account_uuid=ACCOUNT_UUID`).

## Events

| JWT `event` | Purpose |
|-------------|---------|
| `sms_dashboard_settings` | Main iframe dashboard |
| `sms_dashboard_action` | Job card Send SMS modal |
| `sms_dashboard_save` | Persist rules/templates/settings |
| `sms_dashboard_send` | Manual send for current job |
| `sms_test_yeastar` | Connection test from Settings |
| `webhook_subscription` | Acknowledge webhook registration |
| Job webhooks | Status changes → rules engine |

OAuth scopes: `read_jobs read_customers manage_customers`.
