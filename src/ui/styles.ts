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
  .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .tab {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #374151;
    border-radius: 6px;
    cursor: pointer;
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
  table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
  th { text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb; background: #f3f4f6; color: #374151; font-weight: 600; }
  td { text-align: left; padding: 8px; border-bottom: 1px solid #f3f4f6; color: #1f2937; }
  textarea, input, select {
    width: 100%;
    padding: 8px;
    margin: 4px 0 12px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #fff;
    color: #1f2937;
  }
  button {
    padding: 8px 14px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  button.secondary {
    background: #fff;
    color: #374151;
    border: 1px solid #d1d5db;
  }
  .stat { font-size: 24px; font-weight: 600; color: #111827; }
  .muted { color: #6b7280; font-size: 12px; }
  a { color: #2563eb; }
  pre { background: #f3f4f6; color: #374151; padding: 8px; border-radius: 4px; border: 1px solid #e5e7eb; }
`;
