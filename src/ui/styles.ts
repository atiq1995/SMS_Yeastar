export const SHARED_STYLES = `
  * { box-sizing: border-box; }
  html { color-scheme: light; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    margin: 0;
    padding: 16px;
    color: #1f2937;
    background: #ffffff;
  }
  h1 { font-size: 1.25rem; margin: 0 0 12px; color: #111827; }
  h2 { margin: 0; font-size: 1rem; color: #111827; }
  .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .tab {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #374151;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }
  .tab.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
  .panel {
    display: none;
    background: #fafafa;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
  }
  .panel.active { display: block; }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    gap: 12px;
    flex-wrap: wrap;
  }
  .card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 12px;
  }
  label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
  th {
    text-align: left;
    padding: 10px 8px;
    border-bottom: 1px solid #e5e7eb;
    background: #f3f4f6;
    color: #374151;
    font-weight: 600;
    white-space: nowrap;
  }
  td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #f3f4f6; color: #1f2937; vertical-align: middle; }
  td input, td select { margin-bottom: 0; min-width: 0; }
  textarea, input, select {
    width: 100%;
    padding: 8px;
    margin: 4px 0 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
    color: #1f2937;
    font-size: 13px;
  }
  textarea { min-height: 80px; resize: vertical; font-family: inherit; line-height: 1.45; }
  button {
    padding: 8px 14px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }
  button.secondary { background: #fff; color: #374151; border: 1px solid #d1d5db; }
  button.danger { background: #fff; color: #b91c1c; border: 1px solid #fecaca; }
  button.sm { padding: 4px 10px; font-size: 12px; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .chip {
    padding: 4px 8px;
    font-size: 11px;
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
    border-radius: 999px;
    cursor: pointer;
    user-select: none;
  }
  .chip:hover { background: #dbeafe; }
  .hint { font-size: 11px; color: #6b7280; margin: -6px 0 10px; }
  .preview-box {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    padding: 12px;
    font-size: 13px;
    line-height: 1.5;
    color: #14532d;
  }
  .preview-box strong {
    display: block;
    font-size: 11px;
    color: #166534;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .table-wrap { overflow-x: auto; }
  .tpl-snippet {
    color: #6b7280;
    font-size: 12px;
    max-width: 420px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-actions { display: flex; gap: 6px; white-space: nowrap; }
  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
    flex-wrap: wrap;
  }
  .toast {
    display: none;
    padding: 8px 12px;
    border-radius: 6px;
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
    font-size: 13px;
  }
  .toast.show { display: inline-block; }
  .toast.err { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
  .empty { text-align: center; padding: 24px; color: #9ca3af; font-size: 13px; }
  .stat { font-size: 24px; font-weight: 600; color: #111827; }
  .muted { color: #6b7280; font-size: 12px; }
  a { color: #2563eb; }
  pre { background: #f3f4f6; color: #374151; padding: 8px; border-radius: 4px; border: 1px solid #e5e7eb; font-size: 12px; }
  .modal-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 100;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .modal-backdrop.open { display: flex; }
  .modal {
    background: #fff;
    border-radius: 10px;
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 20px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    border: 1px solid #e5e7eb;
  }
  .modal h3 { margin: 0 0 16px; font-size: 1.05rem; color: #111827; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
  .modal-actions button { margin-bottom: 0; }
`;
