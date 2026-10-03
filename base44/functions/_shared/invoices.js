export function money(value) {
  const numeric = Number(value) || 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

export function cents(value) {
  const numeric = Number(value) || 0;
  return Math.round((numeric + Number.EPSILON) * 100);
}

function invoiceNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `INV-${date}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function createInvoiceForJob(base44, job) {
  if (job.invoice_id) {
    const linked = await base44.entities.Invoice.filter({ id: job.invoice_id });
    if (linked?.[0]) return { invoice: linked[0], created: false };
  }

  const existing = await base44.entities.Invoice.filter({ job_id: job.id });
  if (existing?.[0]) {
    await base44.entities.Job.update(job.id, {
      invoice_id: existing[0].id,
      invoice_status: existing[0].status || 'draft',
    });
    return { invoice: existing[0], created: false };
  }

  let estimate = null;
  if (job.estimate_id) {
    const estimates = await base44.entities.Estimate.filter({ id: job.estimate_id });
    estimate = estimates?.[0] || null;
  }

  let customerEmail = '';
  if (job.customer_id) {
    const customers = await base44.entities.Customer.filter({ id: job.customer_id });
    customerEmail = customers?.[0]?.email || '';
  }

  const total = money(job.total ?? estimate?.total);
  const totalCents = cents(total);
  const invoice = await base44.entities.Invoice.create({
    invoice_number: invoiceNumber(),
    job_id: job.id,
    estimate_id: job.estimate_id || '',
    estimate_number: job.estimate_number || estimate?.estimate_number || '',
    customer_name: job.customer_name || estimate?.customer_name || '',
    customer_address: job.customer_address || estimate?.customer_address || '',
    customer_phone: job.customer_phone || estimate?.customer_phone || '',
    customer_email: customerEmail || estimate?.customer_email || '',
    job_type: job.job_type || estimate?.job_type || '',
    job_description: job.job_description || estimate?.job_description || '',
    photos_before: job.photos_before || [],
    photos_after: job.photos_after || [],
    line_items: estimate?.line_items || job.line_items || [],
    subtotal: money(estimate?.subtotal ?? total),
    markup_percent: money(estimate?.markup_percent),
    markup_amount: money(estimate?.markup_amount),
    tax_percent: money(estimate?.tax_percent),
    tax_amount: money(estimate?.tax_amount),
    total,
    total_cents: totalCents,
    amount_paid_cents: 0,
    balance_due_cents: totalCents,
    payment_status: 'unpaid',
    status: 'draft',
    public_token: crypto.randomUUID(),
    public_token_expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    customer_notes: estimate?.customer_notes || '',
  });

  await base44.entities.Job.update(job.id, { invoice_id: invoice.id, invoice_status: 'draft' });
  await base44.entities.Notification.create({
    type: 'system',
    title: 'Invoice ready for review',
    message: `Invoice ${invoice.invoice_number} for ${invoice.customer_name || 'customer'} is ready to review and send.`,
    link: `/invoices/${invoice.id}`,
    job_id: job.id,
    read: false,
  });
  return { invoice, created: true };
}
