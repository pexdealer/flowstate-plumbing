import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { createInvoiceForJob } from '../../shared/invoices.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const jobId = typeof body.job_id === 'string' ? body.job_id : '';
    if (!jobId) return Response.json({ error: 'Job ID required' }, { status: 400 });

    const jobs = await base44.entities.Job.filter({ id: jobId });
    const job = jobs?.[0];
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    const result = await createInvoiceForJob(base44, job);
    return Response.json({
      ok: true,
      invoice_id: result.invoice.id,
      invoice_number: result.invoice.invoice_number,
      created: result.created,
    });
  } catch (_) {
    return Response.json({ error: 'Unable to create invoice' }, { status: 500 });
  }
}