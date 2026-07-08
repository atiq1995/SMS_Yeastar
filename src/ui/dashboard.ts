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

export function renderDashboardHtml(accountUuid: string): string {
  const templates = listTemplates();
  const rules = listRules();
  const outbound = listOutbound(50);
  const inbound = listInbound(50);
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const sent7d = countOutboundSince(since);
  const enRoute = getSetting("en_route_statuses") ?? "En Route,Dispatched";

  const tplJson = JSON.stringify(templates.map((t) => ({ id: t.id, name: t.name, body: t.body })));
  const rulesJson = JSON.stringify(
    rules.map((r) => ({
      id: r.id,
      name: r.name,
      trigger_type: r.trigger_type,
      status_match: r.status_match ?? "",
      template_id: r.template_id,
      enabled: !!r.enabled,
    }))
  );
  const maxTplId = templates.reduce((m, t) => Math.max(m, t.id), 0);
  const maxRuleId = rules.reduce((m, r) => Math.max(m, r.id), 0);

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
  <p>Yeastar send: <strong>${env.yeastarSendEnabled ? "enabled" : "dry-run"}</strong></p>
</div>

<div id="rules" class="panel">
  <div class="panel-head">
    <div>
      <h2>Automation rules</h2>
      <p class="muted" style="margin:4px 0 0">Choose when to send SMS and which template to use.</p>
    </div>
    <button type="button" id="addRule" class="secondary">+ Add rule</button>
  </div>
  <div class="card table-wrap" style="padding:0">
    <table>
      <thead>
        <tr>
          <th>Rule name</th>
          <th>When</th>
          <th>Status match</th>
          <th>Template</th>
          <th>On</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="ruleList"></tbody>
    </table>
  </div>
  <p class="hint"><strong>When:</strong> Job created · Status changed · En route · Job completed</p>
  <div class="actions">
    <button type="button" id="saveRules">Save rules</button>
    <span id="rulesToast" class="toast"></span>
  </div>
</div>

<div id="templates" class="panel">
  <div class="panel-head">
    <div>
      <h2>Message templates</h2>
      <p class="muted" style="margin:4px 0 0">SMS text sent when a rule fires. Edit or delete from the list.</p>
    </div>
    <button type="button" id="addTemplate" class="secondary">+ Add template</button>
  </div>
  <div class="card table-wrap" style="padding:0">
    <table>
      <thead>
        <tr><th>Name</th><th>Message preview</th><th></th></tr>
      </thead>
      <tbody id="templateList"></tbody>
    </table>
  </div>
  <div class="actions">
    <button type="button" id="saveTemplates">Save templates</button>
    <span id="templatesToast" class="toast"></span>
  </div>
</div>

<div id="log" class="panel">
  <div class="card table-wrap" style="padding:0">
    <table><thead><tr><th>When</th><th>To</th><th>Status</th><th>Body</th></tr></thead>
    <tbody>${outbound.map((m) => `<tr><td>${esc(String(m.created_at))}</td><td>${esc(String(m.to_number))}</td><td>${esc(String(m.status))}</td><td>${esc(String(m.body).slice(0, 80))}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">No outbound messages yet</td></tr>'}</tbody></table>
  </div>
</div>

<div id="inbox" class="panel">
  <div class="card table-wrap" style="padding:0">
    <table><thead><tr><th>When</th><th>From</th><th>Message</th></tr></thead>
    <tbody>${inbound.map((m) => `<tr><td>${esc(String(m.received_at))}</td><td>${esc(String(m.from_number))}</td><td>${esc(String(m.body))}</td></tr>`).join("") || '<tr><td colspan="3" class="empty">No inbound messages yet</td></tr>'}</tbody></table>
  </div>
</div>

<div id="analytics" class="panel">
  <div class="card">
    <p>Sent last 7 days: <strong>${sent7d}</strong></p>
    <p>Inbound stored: <strong>${inbound.length}</strong> (latest page)</p>
  </div>
</div>

<div id="settings" class="panel">
  <div class="card">
    <label>En-route status labels (comma-separated)</label>
    <input id="enRouteStatuses" value="${esc(enRoute)}" />
    <div class="actions" style="margin-top:0;padding-top:0;border-top:none">
      <button type="button" id="saveSettings">Save settings</button>
      <button type="button" class="secondary" id="testYeastar">Test Yeastar</button>
    </div>
    <p><a href="${esc(env.appUrl)}/oauth/activate?account_uuid=${encodeURIComponent(accountUuid)}" target="_blank">Reconnect OAuth</a></p>
    <pre id="settingsOut" class="muted"></pre>
  </div>
</div>

<div id="templateModal" class="modal-backdrop" aria-hidden="true">
  <div class="modal" role="dialog" aria-labelledby="templateModalTitle">
    <h3 id="templateModalTitle">Add template</h3>
    <label for="modalTplName">Template name</label>
    <input type="text" id="modalTplName" placeholder="e.g. job_created" />
    <p class="hint">Short ID — letters, numbers, underscores</p>
    <label for="modalTplBody">Message</label>
    <div class="chips" id="modalTplChips"></div>
    <textarea id="modalTplBody" rows="5" placeholder="Hi {{customerName}}, ..."></textarea>
    <label>Live preview</label>
    <div class="preview-box" id="modalTplPreview"><strong>Sample SMS</strong><span></span></div>
    <div class="modal-actions">
      <button type="button" class="secondary" id="modalTplCancel">Cancel</button>
      <button type="button" id="modalTplSave">Save template</button>
    </div>
  </div>
</div>


<script>
let client = null;
try { client = SMClient.init(); } catch (e) { console.warn('SMClient', e); }
const accountUuid = ${JSON.stringify(accountUuid)};

const VARS = ['customerName', 'jobNumber', 'status', 'address', 'companyName', 'mobile'];
const TRIGGERS = [
  { value: 'job_created', label: 'Job created' },
  { value: 'status_changed', label: 'Status changed' },
  { value: 'en_route', label: 'Technician en route' },
  { value: 'completed', label: 'Job completed' },
];
const SAMPLE = {
  customerName: 'Jane Smith',
  jobNumber: 'J-1042',
  status: 'En Route',
  address: '12 Oak St',
  companyName: "Tom's Pest Control",
  mobile: '0412 345 678',
};

let templates = ${tplJson};
let rules = ${rulesJson};
const persistedTplIds = new Set(${JSON.stringify(templates.map((t) => t.id))});
let nextTplId = ${maxTplId + 1};
let nextRuleId = ${maxRuleId + 1};
let editingTplId = null;

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function renderPreview(body) {
  return body.replace(/\\{\\{(\\w+)\\}\\}/g, (_, k) => SAMPLE[k] ?? '{{' + k + '}}');
}

function snippet(body) {
  const text = renderPreview(body);
  return text.length > 72 ? text.slice(0, 72) + '…' : text;
}

function showToast(id, msg, err) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'toast show' + (err ? ' err' : '');
  setTimeout(() => el.classList.remove('show'), 3000);
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).classList.add('active');
});

function invoke(event, args) {
  if (!client) throw new Error('ServiceM8 SDK not available');
  return client.invoke(event, Object.assign({ account_uuid: accountUuid }, args || {}));
}

function templateOptions(selected) {
  return templates.map((t) =>
    '<option value="' + t.id + '"' + (t.id === selected ? ' selected' : '') + '>' + escHtml(t.name) + '</option>'
  ).join('');
}

function statusMatchEnabled(trigger) {
  return trigger === 'status_changed' || trigger === 'completed';
}

function bindRuleRow(row) {
  const id = Number(row.dataset.ruleId);
  const rule = rules.find((r) => r.id === id);
  if (!rule) return;
  row.querySelector('.rule-name').addEventListener('input', (e) => { rule.name = e.target.value; });
  row.querySelector('.rule-trigger').addEventListener('change', (e) => {
    rule.trigger_type = e.target.value;
    const statusInput = row.querySelector('.rule-status');
    const on = statusMatchEnabled(rule.trigger_type);
    statusInput.disabled = !on;
    statusInput.style.opacity = on ? '1' : '0.45';
    if (!on) { statusInput.value = ''; rule.status_match = ''; }
  });
  row.querySelector('.rule-status').addEventListener('input', (e) => { rule.status_match = e.target.value; });
  row.querySelector('.rule-template').addEventListener('change', (e) => { rule.template_id = Number(e.target.value); });
  row.querySelector('.rule-enabled').addEventListener('change', (e) => { rule.enabled = e.target.checked; });
  row.querySelector('.remove-rule').addEventListener('click', () => {
    rules = rules.filter((r) => r.id !== id);
    renderRules();
  });
}

function renderRules() {
  const el = document.getElementById('ruleList');
  if (!rules.length) {
    el.innerHTML = '<tr><td colspan="6" class="empty">No rules — click <strong>+ Add rule</strong></td></tr>';
    return;
  }
  el.innerHTML = rules.map((r) => {
    const statusOn = statusMatchEnabled(r.trigger_type);
    return '<tr data-rule-id="' + r.id + '">' +
      '<td><input type="text" class="rule-name" value="' + escHtml(r.name) + '" placeholder="e.g. New job" /></td>' +
      '<td><select class="rule-trigger">' +
      TRIGGERS.map((t) => '<option value="' + t.value + '"' + (t.value === r.trigger_type ? ' selected' : '') + '>' + t.label + '</option>').join('') +
      '</select></td>' +
      '<td><input type="text" class="rule-status" value="' + escHtml(r.status_match) + '" placeholder="Any status"' +
      (statusOn ? '' : ' disabled style="opacity:0.45"') + ' /></td>' +
      '<td><select class="rule-template">' + templateOptions(r.template_id) + '</select></td>' +
      '<td><input type="checkbox" class="rule-enabled"' + (r.enabled ? ' checked' : '') + ' /></td>' +
      '<td><button type="button" class="danger sm remove-rule">Remove</button></td></tr>';
  }).join('');
  el.querySelectorAll('tr[data-rule-id]').forEach(bindRuleRow);
}

function renderTemplates() {
  const el = document.getElementById('templateList');
  if (!templates.length) {
    el.innerHTML = '<tr><td colspan="3" class="empty">No templates — click <strong>+ Add template</strong></td></tr>';
    return;
  }
  el.innerHTML = templates.map((t) =>
    '<tr data-tpl-id="' + t.id + '">' +
    '<td><strong>' + escHtml(t.name) + '</strong></td>' +
    '<td class="tpl-snippet" title="' + escHtml(renderPreview(t.body)) + '">' + escHtml(snippet(t.body)) + '</td>' +
    '<td><div class="row-actions">' +
    '<button type="button" class="secondary sm edit-tpl" data-id="' + t.id + '">Edit</button>' +
    '<button type="button" class="danger sm delete-tpl" data-id="' + t.id + '"' + (templates.length <= 1 ? ' disabled' : '') + '>Delete</button>' +
    '</div></td></tr>'
  ).join('');
  el.querySelectorAll('.edit-tpl').forEach((btn) => {
    btn.addEventListener('click', () => openTemplateModal(Number(btn.dataset.id)));
  });
  el.querySelectorAll('.delete-tpl').forEach((btn) => {
    btn.addEventListener('click', () => deleteTemplate(Number(btn.dataset.id)));
  });
}

function openTemplateModal(id) {
  editingTplId = id ?? null;
  const modal = document.getElementById('templateModal');
  const title = document.getElementById('templateModalTitle');
  const nameInput = document.getElementById('modalTplName');
  const bodyInput = document.getElementById('modalTplBody');
  const previewSpan = document.querySelector('#modalTplPreview span');
  if (editingTplId) {
    const t = templates.find((x) => x.id === editingTplId);
    title.textContent = 'Edit template';
    nameInput.value = t?.name ?? '';
    bodyInput.value = t?.body ?? '';
  } else {
    title.textContent = 'Add template';
    nameInput.value = '';
    bodyInput.value = 'Hi {{customerName}}, ';
  }
  previewSpan.textContent = renderPreview(bodyInput.value);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  nameInput.focus();
}

function closeTemplateModal() {
  document.getElementById('templateModal').classList.remove('open');
  document.getElementById('templateModal').setAttribute('aria-hidden', 'true');
  editingTplId = null;
}

function updateModalPreview() {
  document.querySelector('#modalTplPreview span').textContent =
    renderPreview(document.getElementById('modalTplBody').value);
}

function setupTemplateModal() {
  const chipsEl = document.getElementById('modalTplChips');
  chipsEl.innerHTML = VARS.map((v) => '<span class="chip" data-var="' + v + '">{{' + v + '}}</span>').join('');
  chipsEl.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const ta = document.getElementById('modalTplBody');
      const v = '{{' + chip.dataset.var + '}}';
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? start;
      ta.value = ta.value.slice(0, start) + v + ta.value.slice(end);
      ta.focus();
      ta.setSelectionRange(start + v.length, start + v.length);
      updateModalPreview();
    });
  });
  document.getElementById('modalTplBody').addEventListener('input', updateModalPreview);
  document.getElementById('modalTplCancel').addEventListener('click', closeTemplateModal);
  document.getElementById('templateModal').addEventListener('click', (e) => {
    if (e.target.id === 'templateModal') closeTemplateModal();
  });
  document.getElementById('modalTplSave').addEventListener('click', () => {
    const name = document.getElementById('modalTplName').value.trim();
    const body = document.getElementById('modalTplBody').value.trim();
    if (!name) { alert('Please enter a template name.'); return; }
    if (!body) { alert('Please enter a message.'); return; }
    if (editingTplId) {
      const t = templates.find((x) => x.id === editingTplId);
      if (t) { t.name = name; t.body = body; }
    } else {
      templates.push({ id: nextTplId++, name, body });
    }
    closeTemplateModal();
    renderTemplates();
    renderRules();
  });
}

function deleteTemplate(id) {
  if (templates.length <= 1) { alert('Keep at least one template.'); return; }
  const used = rules.some((r) => r.template_id === id);
  const msg = used
    ? 'This template is used by a rule. Delete anyway? Rules using it will switch to the first template.'
    : 'Delete this template?';
  if (!confirm(msg)) return;
  templates = templates.filter((x) => x.id !== id);
  rules.forEach((r) => { if (r.template_id === id) r.template_id = templates[0].id; });
  renderTemplates();
  renderRules();
}

document.getElementById('addTemplate').addEventListener('click', () => openTemplateModal(null));
document.getElementById('addRule').addEventListener('click', () => {
  rules.push({
    id: nextRuleId++,
    name: 'New rule',
    trigger_type: 'job_created',
    status_match: '',
    template_id: templates[0]?.id ?? 1,
    enabled: true,
  });
  renderRules();
});

document.getElementById('saveTemplates').addEventListener('click', async () => {
  try {
    const payload = templates.map((t) => ({
      id: persistedTplIds.has(t.id) ? t.id : undefined,
      name: t.name,
      body: t.body,
    }));
    const res = await invoke('sms_dashboard_save', { section: 'templates', templates: payload });
    if (res && res.ok !== false) {
      showToast('templatesToast', 'Templates saved');
      setTimeout(() => location.reload(), 800);
    } else {
      showToast('templatesToast', JSON.stringify(res), true);
    }
  } catch (e) {
    showToast('templatesToast', String(e), true);
  }
});

document.getElementById('saveRules').addEventListener('click', async () => {
  try {
    const payload = rules.map((r, i) => ({
      name: r.name,
      trigger_type: r.trigger_type,
      status_match: r.status_match || null,
      template_id: r.template_id,
      enabled: r.enabled ? 1 : 0,
      sort_order: i,
    }));
    const res = await invoke('sms_dashboard_save', { section: 'rules', rules: payload });
    if (res && res.ok !== false) {
      showToast('rulesToast', 'Rules saved');
    } else {
      showToast('rulesToast', JSON.stringify(res), true);
    }
  } catch (e) {
    showToast('rulesToast', String(e), true);
  }
});

document.getElementById('saveSettings')?.addEventListener('click', async () => {
  try {
    const res = await invoke('sms_dashboard_save', {
      section: 'settings',
      en_route_statuses: document.getElementById('enRouteStatuses').value,
    });
    document.getElementById('settingsOut').textContent = JSON.stringify(res);
  } catch (e) {
    document.getElementById('settingsOut').textContent = String(e);
  }
});

document.getElementById('testYeastar')?.addEventListener('click', async () => {
  try {
    const res = await invoke('sms_test_yeastar', {});
    document.getElementById('settingsOut').textContent = JSON.stringify(res);
  } catch (e) {
    document.getElementById('settingsOut').textContent = String(e);
  }
});

setupTemplateModal();
renderTemplates();
renderRules();
</script>
</body></html>`;
}
