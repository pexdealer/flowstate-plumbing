// Calendar helpers: turn a job/estimate into "Add to Calendar" links and an
// .ics file — all without OAuth. Google and Outlook links open a pre-filled
// event the plumber just clicks to save; the .ics works for Apple Calendar and
// any other client. This is the zero-setup ("Option A") calendar path.

// Format a Date as a UTC iCalendar timestamp: 20260613T140000Z
function toICSDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Escape text for an .ics field (commas, semicolons, newlines are special).
function escapeICS(text = "") {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Normalize whatever the caller passes (strings or Dates) into a {start,end}
// pair of Date objects. Defaults to a 2-hour window starting tomorrow at 9am
// so there is always a sane event even before the plumber picks a time.
function resolveWindow({ start, end, durationMinutes = 120 } = {}) {
  let startDate = start ? new Date(start) : null;
  if (!startDate || isNaN(startDate.getTime())) {
    startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(9, 0, 0, 0);
  }
  let endDate = end ? new Date(end) : null;
  if (!endDate || isNaN(endDate.getTime())) {
    endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  }
  return { startDate, endDate };
}

/**
 * Build a calendar event object from a Job (or an Estimate-shaped object).
 */
export function eventFromJob(job = {}) {
  const { startDate, endDate } = resolveWindow({
    start: job.scheduled_start,
    end: job.scheduled_end,
  });
  const typeLabel = (job.job_type || "job").replace(/_/g, " ");
  const title =
    job.title || `${titleCase(typeLabel)} — ${job.customer_name || "Customer"}`;
  const descriptionParts = [
    job.job_description,
    job.estimate_number ? `Estimate #${job.estimate_number}` : "",
    job.customer_phone ? `Phone: ${job.customer_phone}` : "",
    typeof job.total === "number" ? `Total: $${job.total.toFixed(2)}` : "",
  ].filter(Boolean);

  return {
    title,
    description: descriptionParts.join("\n"),
    location: job.customer_address || "",
    start: startDate,
    end: endDate,
  };
}

function titleCase(str = "") {
  return str.replace(/\b\w/g, (l) => l.toUpperCase());
}

/** Google Calendar "render an event" template URL (no OAuth needed). */
export function googleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title || "",
    dates: `${toICSDate(event.start)}/${toICSDate(event.end)}`,
    details: event.description || "",
    location: event.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook (personal + office365) compose-event deeplink (no OAuth needed). */
export function outlookCalendarUrl(event, { office365 = false } = {}) {
  const host = office365 ? "outlook.office.com" : "outlook.live.com";
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title || "",
    startdt: event.start.toISOString(),
    enddt: event.end.toISOString(),
    body: event.description || "",
    location: event.location || "",
  });
  return `https://${host}/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Raw .ics file contents for Apple Calendar / download / email attachment. */
export function icsContent(event, { uid } = {}) {
  const stamp = toICSDate(new Date());
  const eventUid =
    uid || `${stamp}-${Math.random().toString(36).slice(2)}@flowstate-plumbing`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FlowState Plumbing//Dispatch//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${eventUid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toICSDate(event.start)}`,
    `DTEND:${toICSDate(event.end)}`,
    `SUMMARY:${escapeICS(event.title)}`,
    `DESCRIPTION:${escapeICS(event.description)}`,
    `LOCATION:${escapeICS(event.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Trigger a browser download of the event as a .ics file. */
export function downloadICS(event, filename = "job.ics") {
  const blob = new Blob([icsContent(event)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Convenience: all add-to-calendar links for a job in one call. */
export function calendarLinksForJob(job) {
  const event = eventFromJob(job);
  return {
    event,
    google: googleCalendarUrl(event),
    outlook: outlookCalendarUrl(event),
    office365: outlookCalendarUrl(event, { office365: true }),
  };
}
