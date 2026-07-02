export const defaultTemplates = [
  {
    name: "job_created",
    body: "Hi {{customerName}}, we received your job {{jobNumber}}. We will be in touch soon. — Tom's Pest Control",
  },
  {
    name: "status_update",
    body: "Hi {{customerName}}, job {{jobNumber}} is now: {{status}}. — Tom's Pest Control",
  },
  {
    name: "en_route",
    body: "Hi {{customerName}}, our technician is on the way to {{address}} for job {{jobNumber}}.",
  },
  {
    name: "completed",
    body: "Hi {{customerName}}, job {{jobNumber}} is complete. Thank you for choosing Tom's Pest Control.",
  },
];

export const defaultRules = [
  { name: "New job", trigger_type: "job_created", status_match: null, templateName: "job_created" },
  { name: "Status change", trigger_type: "status_changed", status_match: null, templateName: "status_update" },
  { name: "En route", trigger_type: "en_route", status_match: null, templateName: "en_route" },
  { name: "Completed", trigger_type: "completed", status_match: "Completed", templateName: "completed" },
];
