import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { createInvoiceForJob } from '../_shared/invoices.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const { event, data } = payload;
    if (event?.type !== 'update' || data?.status !== 'completed' || !data?.id) {
      return Response.json({ skipped: true, reason: 'Not a completed job update' });
    }

    // User-scoped lookup is the authorization boundary; never trust workflow payload fields.
    const jobs = await base44.entities.Job.filter({ id: data.id });
    const job = jobs?.[0];
    if (!job) return Response.json({ error: 'Job not found or not authorized' }, { status: 404 });

    const result = await createInvoiceForJob(base44, job);
    return Response.json({
      success: true,
      invoice_id: result.invoice.id,
      created: result.created,
    });
  } catch (_) {
    return Response.json({ error: 'Unable to generate invoice' }, { status: 500 });
  }
});
