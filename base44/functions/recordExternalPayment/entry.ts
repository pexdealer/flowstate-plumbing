import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const METHODS = new Set(['cash', 'check', 'venmo', 'cash_app', 'other']);

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id : '';
    const method = typeof body.method === 'string' ? body.method : '';
    const amountCents = Math.round(Number(body.amount_cents));
    const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
    if (!invoiceId || !METHODS.has(method) || !Number.isInteger(amountCents) || amountCents <= 0 || !idempotencyKey) {
      return Response.json({ error: 'A valid invoice, payment method, and amount are required' }, { status: 400 });
    }

    const invoices = await base44.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices?.[0];
    if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });

    const priorRequests = await base44.entities.Payment.filter({ idempotency_key: idempotencyKey });
    if (priorRequests?.[0]) {
      return Response.json({ ok: true, payment_id: priorRequests[0].id, duplicate: true });
    }

    const totalCents = Number.isInteger(invoice.total_cents)
      ? invoice.total_cents
      : Math.round((Number(invoice.total) || 0) * 100);
    const payments = await base44.entities.Payment.filter({ invoice_id: invoice.id });
    const alreadyPaid = (payments || [])
      .filter((payment) => payment.status === 'succeeded')
      .reduce((sum, payment) => sum + (Number(payment.amount_cents) || 0), 0);
    const remaining = Math.max(totalCents - alreadyPaid, 0);
    if (amountCents > remaining) {
      return Response.json({ error: `Payment exceeds the remaining balance of $${(remaining / 100).toFixed(2)}` }, { status: 400 });
    }

    const now = new Date().toISOString();
    const payment = await base44.entities.Payment.create({
      invoice_id: invoice.id,
      job_id: invoice.job_id || '',
      amount_cents: amountCents,
      currency: 'usd',
      method,
      status: 'succeeded',
      provider: 'external',
      external_reference: String(body.external_reference || '').trim(),
      received_at: now,
      recorded_by: user.email || user.id,
      notes: String(body.notes || '').trim(),
      idempotency_key: idempotencyKey,
    });

    const amountPaid = alreadyPaid + amountCents;
    const balanceDue = Math.max(totalCents - amountPaid, 0);
    const paid = balanceDue === 0;
    await base44.entities.Invoice.update(invoice.id, {
      total_cents: totalCents,
      amount_paid_cents: amountPaid,
      balance_due_cents: balanceDue,
      payment_status: paid ? 'paid' : 'partial',
      status: paid ? 'paid' : invoice.status,
      ...(paid ? { paid_at: now } : {}),
    });
    if (invoice.job_id) {
      await base44.entities.Job.update(invoice.job_id, { invoice_status: paid ? 'paid' : invoice.status });
    }

    return Response.json({ ok: true, payment_id: payment.id, amount_paid_cents: amountPaid, balance_due_cents: balanceDue });
  } catch (_) {
    return Response.json({ error: 'Unable to record payment' }, { status: 500 });
  }
}
