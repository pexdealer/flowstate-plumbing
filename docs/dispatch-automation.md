# Sale → Dispatch Automation

This documents the "customer accepts an estimate → you get notified → the job
goes on your calendar" flow, and the one manual step that has to be done in the
Base44 Builder.

## What's already wired in the repo

| Piece | Where | Status |
|---|---|---|
| `public_token`, `sent_at`, `viewed_at`, `accepted_at`, `accepted_by_name`, `accepted_signature`, `declined_at`, `job_id` on the estimate | `base44/entities/Estimate.jsonc` | ✅ |
| `Job` entity (dispatch board) | `base44/entities/Job.jsonc` | ✅ |
| `Notification` entity (in-app alerts) | `base44/entities/Notification.jsonc` | ✅ |
| Customer-facing proposal page at `/p/:token` | `src/pages/PublicProposal.jsx` | ✅ |
| "Send to customer" / copy link / acceptance timeline | `src/pages/EstimateDetail.jsx` | ✅ |
| Add-to-Google/Outlook + `.ics` download (no OAuth) | `src/lib/calendar.js` | ✅ |

## The one manual step: three public backend functions

The customer has no account, so the public page can't read your data directly —
Base44's row-level security blocks anonymous reads. The page therefore calls
three **backend functions** that you create once in the Builder
(**Workspace → Backend functions / Code**). Mark all three as allowing
**anonymous / public** access.

These run with the **service role**, so they can read and update the estimate on
the customer's behalf without exposing your data. The exact harness import can
vary by Base44 version — match whatever the Builder's "new function" template
shows; the body logic is what matters.

### `getProposal` — read an estimate by its public token

```js
import { createClientFromRequest } from "@base44/sdk";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { token } = await req.json();
  if (!token) return Response.json({ error: "missing token" }, { status: 400 });

  const matches = await base44.asServiceRole.entities.Estimate.filter({ public_token: token });
  const est = matches?.[0];
  if (!est) return Response.json({ error: "not found" }, { status: 404 });

  // Record the first view (non-blocking, best-effort).
  if (!est.viewed_at) {
    try {
      await base44.asServiceRole.entities.Estimate.update(est.id, { viewed_at: new Date().toISOString() });
    } catch (_) { /* ignore */ }
  }

  // Return only what the customer should see.
  const safe = {
    estimate_number: est.estimate_number,
    customer_name: est.customer_name,
    customer_address: est.customer_address,
    job_type: est.job_type,
    job_description: est.job_description,
    line_items: est.line_items,
    subtotal: est.subtotal,
    tax_percent: est.tax_percent,
    tax_amount: est.tax_amount,
    total: est.total,
    status: est.status,
    accepted_at: est.accepted_at,
    accepted_by_name: est.accepted_by_name,
    declined_at: est.declined_at,
  };

  // Optional: look up the owner's business name from a Settings entity.
  return Response.json({ estimate: safe, business: { name: "FlowState Plumbing" } });
});
```

### `acceptProposal` — record acceptance, create the job, notify you

```js
import { createClientFromRequest } from "@base44/sdk";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { token, name } = await req.json();
  if (!token || !name) return Response.json({ error: "missing fields" }, { status: 400 });

  const matches = await base44.asServiceRole.entities.Estimate.filter({ public_token: token });
  const est = matches?.[0];
  if (!est) return Response.json({ error: "not found" }, { status: 404 });
  if (est.status === "approved") return Response.json({ ok: true, already: true });

  const now = new Date().toISOString();
  const ip = req.headers.get("x-forwarded-for") || "";

  await base44.asServiceRole.entities.Estimate.update(est.id, {
    status: "approved",
    accepted_at: now,
    accepted_by_name: name,
    accepted_signature: name,
    accepted_ip: ip,
  });

  // Auto-create the dispatch job.
  const job = await base44.asServiceRole.entities.Job.create({
    title: `${(est.job_type || "Job").replace(/_/g, " ")} — ${est.customer_name || "Customer"}`,
    estimate_id: est.id,
    estimate_number: est.estimate_number,
    customer_id: est.customer_id,
    customer_name: est.customer_name,
    customer_address: est.customer_address,
    job_type: est.job_type,
    job_description: est.job_description,
    total: est.total,
    status: "unscheduled",
    created_by: est.created_by, // keep the job owned by the plumber
  });
  await base44.asServiceRole.entities.Estimate.update(est.id, { job_id: job.id });

  // In-app notification for the owner.
  await base44.asServiceRole.entities.Notification.create({
    type: "estimate_accepted",
    title: "Estimate accepted",
    message: `${est.customer_name} accepted estimate #${est.estimate_number || ""} ($${(est.total || 0).toFixed(2)}).`,
    estimate_id: est.id,
    job_id: job.id,
    link: `/estimates/${est.id}`,
    created_by: est.created_by,
  });

  // Email the plumber (SendEmail delivers to registered users — that's you).
  if (est.created_by) {
    const gcal =
      "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" +
      encodeURIComponent(`${est.job_type || "Job"} — ${est.customer_name}`) +
      "&location=" + encodeURIComponent(est.customer_address || "");
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: est.created_by,
        subject: `✅ ${est.customer_name} accepted estimate #${est.estimate_number || ""}`,
        body:
          `${est.customer_name} just accepted their estimate.\n\n` +
          `Job: ${est.job_type}\nAddress: ${est.customer_address || "—"}\n` +
          `Total: $${(est.total || 0).toFixed(2)}\n\n` +
          `Add it to your calendar: ${gcal}\n\n` +
          `Open it in FlowState to schedule and dispatch.`,
      });
    } catch (_) { /* don't fail acceptance if email hiccups */ }
  }

  return Response.json({ ok: true });
});
```

### `declineProposal` — record a decline

```js
import { createClientFromRequest } from "@base44/sdk";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { token } = await req.json();
  const matches = await base44.asServiceRole.entities.Estimate.filter({ public_token: token });
  const est = matches?.[0];
  if (!est) return Response.json({ error: "not found" }, { status: 404 });

  await base44.asServiceRole.entities.Estimate.update(est.id, {
    status: "declined",
    declined_at: new Date().toISOString(),
  });
  await base44.asServiceRole.entities.Notification.create({
    type: "estimate_declined",
    title: "Estimate declined",
    message: `${est.customer_name} declined estimate #${est.estimate_number || ""}.`,
    estimate_id: est.id,
    link: `/estimates/${est.id}`,
    created_by: est.created_by,
  });
  return Response.json({ ok: true });
});
```

Until these exist, the public page degrades gracefully: it shows "this proposal
isn't available yet" instead of crashing, and the in-app **Approve/Decline**
buttons keep working for you.

## ⚠️ Multi-tenancy — verify before a second user logs in

Before your buddy gets an account, confirm each business only sees its own data.
In the Builder, open each entity's **permissions / RLS** and make sure read &
write are scoped to the record creator (`created_by`), not "all app users":

- `Estimate`, `Customer`, `Job`, `Notification` → **creator-only** (or org-scoped if you add an Organization).
- The three functions above intentionally use `asServiceRole` to bypass RLS for
  the public token flow only — that's expected and safe because they filter by
  the unguessable `public_token`.

If RLS is currently "all users," every plumber would see every other plumber's
customers. This is the single most important thing to check before onboarding a
second account.

## Upgrade path (later)

- **Native calendar sync (Option B):** add a "Connect calendar" OAuth flow
  (Google Calendar API + Microsoft Graph, or a unified API like Nylas/Cronofy)
  and have `acceptProposal` insert the event directly instead of emailing a link.
- **SMS:** add Twilio so you get a text the second a job is accepted.
- **Scheduling UI:** let the plumber pick `scheduled_start`/`scheduled_end` on the
  Job; the `.ics`/calendar links already honor those fields when set.
