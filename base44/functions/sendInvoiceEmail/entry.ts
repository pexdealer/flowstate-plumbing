import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { invoice_id, invoice_url } = body;
    if (!invoice_id) return Response.json({ error: 'Invoice ID required' }, { status: 400 });

    const invoices = await base44.entities.Invoice.filter({ id: invoice_id });
    const invoice = invoices?.[0];
    if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });

    if (!invoice.customer_email) {
      return Response.json({ error: 'Please add the customer email before sending' }, { status: 400 });
    }

    const requestOrigin = req.headers.get('origin') || '';
    let url = `${requestOrigin}/p/invoice/${invoice.public_token}`;
    if (invoice_url) {
      try {
        const candidate = new URL(invoice_url);
        const expectedPath = `/p/invoice/${invoice.public_token}`;
        if ((!requestOrigin || candidate.origin === requestOrigin) && candidate.pathname === expectedPath) {
          url = candidate.toString();
        }
      } catch (_) { /* Ignore untrusted or malformed client URLs. */ }
    }
    const dueStr = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';

    const balanceDueCents = Number.isInteger(invoice.balance_due_cents)
      ? invoice.balance_due_cents
      : Math.round((Number(invoice.total) || 0) * 100);
    const emailBody = `Hello ${invoice.customer_name || 'there'},

Your invoice is ready.

Invoice #: ${invoice.invoice_number}
Amount Due: $${(balanceDueCents / 100).toFixed(2)}
${dueStr ? `Due Date: ${dueStr}\n` : ''}
You can view your complete invoice — including scope of work, photos, and a full cost breakdown — online here:

${url}

Thank you for your business!`;

    await base44.integrations.Core.SendEmail({
      to: invoice.customer_email,
      subject: `Invoice #${invoice.invoice_number}`,
      body: emailBody,
      from_name: 'Genesis Handyman Solutions',
    });

    // Mark as sent
    await base44.entities.Invoice.update(invoice.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    // Sync job invoice status
    if (invoice.job_id) {
      await base44.entities.Job.update(invoice.job_id, { invoice_status: 'sent' });
    }

    return Response.json({ success: true });
  } catch (_) {
    return Response.json({ error: 'Unable to send invoice' }, { status: 500 });
  }
});
