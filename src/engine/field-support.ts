export type FieldSupportStatus = "exact" | "derived" | "unsupported";

export type FieldSupportInfo = {
  status: FieldSupportStatus;
  note: string;
};

export const LIVE_FIELD_SUPPORT: Record<string, FieldSupportInfo> = {
  "job.contact_first": {
    status: "exact",
    note: "Uses the chosen recipient/contact first name when available.",
  },
  "job.contact_last": {
    status: "exact",
    note: "Uses the chosen recipient/contact last name when available.",
  },
  "job.contact_name": {
    status: "exact",
    note: "Uses the chosen recipient/contact full name when available.",
  },
  "job.generated_job_id": {
    status: "exact",
    note: "Direct job number from the ServiceM8 job record.",
  },
  "job.job_address": {
    status: "exact",
    note: "Direct job/site address from the ServiceM8 job record.",
  },
  "job.address": {
    status: "exact",
    note: "Direct job/site address from the ServiceM8 job record.",
  },
  "job.company_name": {
    status: "exact",
    note: "Company name from the linked ServiceM8 customer record.",
  },
  "job.status": {
    status: "exact",
    note: "Direct job status from the ServiceM8 job record or event context.",
  },
  "job.total_price": {
    status: "exact",
    note: "Direct job total with normalized ServiceM8 total fields.",
  },
  "job.booked_by_name": {
    status: "exact",
    note: "Direct job field when ServiceM8 provides the booker name.",
  },
  "job.next_booking_date": {
    status: "exact",
    note: "Prefer the job field; fall back to next scheduled activity/allocation.",
  },
  "job.next_booking_date_extended": {
    status: "exact",
    note: "Prefer the job field; fall back to next scheduled activity/allocation formatted long-form.",
  },
  "job.next_booking_time": {
    status: "exact",
    note: "Prefer the job field; fall back to next scheduled activity time.",
  },
  "calculation.current_user_first": {
    status: "exact",
    note: "Requires the current add-on user staff UUID from ServiceM8 context.",
  },
  "calculation.current_user_mobile": {
    status: "exact",
    note: "Requires the current add-on user staff record.",
  },
  "staff.first": {
    status: "derived",
    note: "Uses assigned staff when available; otherwise falls back to current user where sensible.",
  },
  "service.name": {
    status: "derived",
    note: "Uses the most likely service description/name available from ServiceM8 job data.",
  },
  "service.service_description": {
    status: "derived",
    note: "Falls back through service_description, service_name, service, description, and category.",
  },
  "location.phone_1": {
    status: "derived",
    note: "Uses the ServiceM8 location phone when scope/data exists; otherwise falls back to available phone fields.",
  },
  "vendor.name": {
    status: "exact",
    note: "Direct business/vendor name from the connected ServiceM8 account.",
  },
  "job.service_warranty_period": {
    status: "derived",
    note: "Depends on account-specific job/company warranty storage.",
  },
  "calculation.current_user_customfield_job_title": {
    status: "derived",
    note: "Uses staff job_title/position when present; exact custom-field parity is not guaranteed.",
  },
  "calculation.current_user_customfield_licence_number": {
    status: "derived",
    note: "Uses staff customfield_licence_number when present.",
  },
  and_will_be_arriving_in_approximately_x_minutes: {
    status: "unsupported",
    note: "ServiceM8 calculates ETA from its own live routing context; this app cannot reproduce it exactly.",
  },
  document: {
    status: "unsupported",
    note: "This app does not have a real ServiceM8 document link source for SMS templates.",
  },
};

function fieldTagRegex(): RegExp {
  return /\{\{[\s\S]*?\}\}|\{([a-z0-9_.]+)\}/gi;
}

export function listTemplateFields(body: string): string[] {
  const seen = new Set<string>();
  const text = String(body ?? "");
  for (const match of text.matchAll(fieldTagRegex())) {
    const key = match[1];
    if (!key) continue;
    seen.add(key.toLowerCase());
  }
  return [...seen];
}

export function fieldSupport(key: string): FieldSupportInfo | undefined {
  return LIVE_FIELD_SUPPORT[String(key).toLowerCase()];
}

export function analyzeTemplateFields(body: string, mergeFields: Record<string, string>) {
  const missingExact: string[] = [];
  const unsupported: string[] = [];
  const derivedMissing: string[] = [];
  for (const key of listTemplateFields(body)) {
    const support = fieldSupport(key);
    if (!support) continue;
    if (support.status === "unsupported") {
      unsupported.push(key);
      continue;
    }
    const value = mergeFields[key];
    if (typeof value === "string" && value.trim()) continue;
    if (support.status === "exact") missingExact.push(key);
    else derivedMissing.push(key);
  }
  return { missingExact, unsupported, derivedMissing };
}
