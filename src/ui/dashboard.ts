import { SHARED_STYLES } from "./styles.js";
import {
  countOutboundSince,
  getSetting,
  listInbound,
  listOutbound,
  listRules,
  listTemplates,
} from "../db/repository.js";
import { env } from "../config/env.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderDashboardHtml(accountUuid: string, jobUuid?: string): string {
  const templates = listTemplates();
  const rules = listRules();
  const outbound = listOutbound(50);
  const inbound = listInbound(50);
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const sent7d = countOutboundSince(since);
  const enRoute = getSetting("en_route_statuses") ?? "En Route,Dispatched";
  const data = { templates, rules, outbound, inbound, sent7d, enRoute, yeastarEnabled: env.yeastarSendEnabled, appUrl: env.appUrl };

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SMS Dashboard</title>
<script src="https://platform.servicem8.com/sdk/1.0/sdk.js"></script>
<style>${SHARED_STYLES}</style></head>
<body>
<h1>SMS Dashboard</h1>
<p class="muted">Account ${esc(accountUuid)}</p>
<div class="tabs" id="tabs">
  <button type="button" class="tab active" data-tab="overview">Overview</button>
  <button type="button" class="tab" data-tab="rules">Rules</button>
  <button type="button" class="tab" data-tab="templates">Templates</button>
  <button type="button" class="tab" data-tab="log">Log</button>
  <button type="button" class="tab" data-tab="inbox">Inbox</button>
  <button type="button" class="tab" data-tab="analytics">Analytics</button>
  <button type="button" class="tab" data-tab="settings">Settings</button>
</div>

<div id="overview" class="panel active">
  <div class="stat">${sent7d}</div><div class="muted">Outbound (7 days)</div>
  <p>Yeastar send: <strong>${data.yeastarEnabled ? "enabled" : "dry-run"}</strong></p>
</div>

<div id="rules" class="panel">
  <p class="muted">Edit JSON and Save — default triggers: job_created, status_changed, en_route, completed.</p>
  <textarea id="rulesJson" rows="12">${esc(JSON.stringify(rules, null, 2))}</textarea>
  <button type="button" id="saveRules">Save rules</button>
</div>

<div id="templates" class="panel">
  <textarea id="templatesJson" rows="12">${esc(JSON.stringify(templates, null, 2))}</textarea>
  <button type="button" id="saveTemplates">Save templates</button>
</div>

<div id="log" class="panel">
  <table><thead><tr><th>When</th><th>To</th><th>Status</th><th>Body</th></tr></thead>
  <tbody>${outbound.map((m) => `<tr><td>${esc(String(m.created_at))}</td><td>${esc(String(m.to_number))}</td><td>${esc(String(m.status))}</td><td>${esc(String(m.body).slice(0, 80))}</td></tr>`).join("")}</tbody></table>
</div>

<div id="inbox" class="panel">
  <table><thead><tr><th>When</th><th>From</th><th>Message</th></tr></thead>
  <tbody>${inbound.map((m) => `<tr><td>${esc(String(m.received_at))}</td><td>${esc(String(m.from_number))}</td><td>${esc(String(m.body))}</td></tr>`).join("")}</tbody></table>
</div>

<div id="analytics" class="panel">
  <p>Sent last 7 days: <strong>${sent7d}</strong></p>
  <p>Inbound stored: <strong>${inbound.length}</strong> (latest page)</p>
</div>

<div id="settings" class="panel">
  <label>En-route status labels (comma-separated)</label>
  <input id="enRouteStatuses" value="${esc(enRoute)}" />
  <button type="button" id="saveSettings">Save settings</button>
  <button type="button" class="secondary" id="testYeastar">Test Yeastar</button>
  <p><a href="${esc(env.appUrl)}/oauth/activate?account_uuid=${encodeURIComponent(accountUuid)}" target="_blank">Reconnect OAuth</a></p>
  <pre id="settingsOut" class="muted"></pre>
</div>

${jobUuid ? `<div style="margin-top:16px"><button type="button" id="sendJobSms">Send SMS for this job</button><pre id="sendOut"></pre></div>` : ""}

<script>
const client = new SMClient();
const accountUuid = ${JSON.stringify(accountUuid)};
const jobUuid = ${JSON.stringify(jobUuid ?? "")};

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

function invoke(event, args) {
  return client.invoke(event, Object.assign({ account_uuid: accountUuid }, args || {}));
}

document.getElementById('saveRules')?.addEventListener('click', async () => {
  const rules = JSON.parse(document.getElementById('rulesJson').value);
  const res = await invoke('sms_dashboard_save', { section: 'rules', rules });
  alert(JSON.stringify(res));
});
document.getElementById('saveTemplates')?.addEventListener('click', async () => {
  const templates = JSON.parse(document.getElementById('templatesJson').value);
  const res = await invoke('sms_dashboard_save', { section: 'templates', templates });
  alert(JSON.stringify(res));
});
document.getElementById('saveSettings')?.addEventListener('click', async () => {
  const en_route_statuses = document.getElementById('enRouteStatuses').value;
  const res = await invoke('sms_dashboard_save', { section: 'settings', en_route_statuses });
  document.getElementById('settingsOut').textContent = JSON.stringify(res);
});
document.getElementById('testYeastar')?.addEventListener('click', async () => {
  const res = await invoke('sms_test_yeastar', {});
  document.getElementById('settingsOut').textContent = JSON.stringify(res);
});
document.getElementById('sendJobSms')?.addEventListener('click', async () => {
  const res = await invoke('sms_dashboard_send', { job_uuid: jobUuid });
  document.getElementById('sendOut').textContent = JSON.stringify(res);
});
</script>
</body></html>`;
}

export function renderJobActionHtml(accountUuid: string, jobUuid: string): string {
  return renderDashboardHtml(accountUuid, jobUuid);
}
