export const defaultTemplates = [
  {
    name: "job_created",
    body: "Hi {{customerName}}, thanks for contacting Tom's Pest Control. We've received job {{jobNumber}} and will be in touch shortly.",
  },
  {
    name: "status_update",
    body: "Hi {{customerName}}, there has been an update to job {{jobNumber}}. If you need anything, just reply to this message.",
  },
  {
    name: "en_route",
    body: "Hi {{customerName}}, our technician is on the way for job {{jobNumber}} and is heading to {{address}}.",
  },
  {
    name: "completed",
    body: "Hi {{customerName}}, your Tom's Pest Control job {{jobNumber}} has been completed. Thank you for choosing us.",
  },
];

export const defaultRules = [
  { name: "New job", trigger_type: "job_created", status_match: null, templateName: "job_created" },
  { name: "Status change", trigger_type: "status_changed", status_match: null, templateName: "status_update" },
  { name: "En route", trigger_type: "en_route", status_match: null, templateName: "en_route" },
  { name: "Completed", trigger_type: "completed", status_match: "Completed", templateName: "completed" },
];
