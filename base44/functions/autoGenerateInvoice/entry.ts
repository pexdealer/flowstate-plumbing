import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { event, data } = payload;

    // Only handle job updates to "completed"
    if (event?.type !== 'update' || data?.status !== 'completed') {
      return Response.json({ skipped: true, reason: 'Not a completed job update' });
    }

    const job = data;

    // Skip if an invoice already exists for this job
    if (job.invoice_id) {
      return Response.json({ skipped: true, reason: 'Invoice already exists' });
    }

    // Ownership check: never trust the payload — load the real job through the
    // user-scoped client so RLS only returns it if the caller owns it.
    const jobData = await base44.entities.Job.filter({ id: job.id });
    const realJob = jobData?.[0];
    if (!realJob) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const j = realJob;

    // Fetch the original estimate for line items (user-scoped, RLS applies)
    let estimate = null;
    if (j.estimate_id) {
      const estData = await base44.entities.Estimate.filter({ id: j.estimate_id });
      estimate = estData?.[0];
    }

    // Fetch customer email (user-scoped, RLS applies)
    let customerEmail = "";
    if (j.customer_id) {
      const custData = await base44.entities.Customer.filter({ id: j.customer_id });
      customerEmail = custData?.[0]?.email || "";
    }

    // Generate a public token and invoice number
    const token = crypto.randomUUID();
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

    const invoice = await base44.entities.Invoice.create({
      invoice_number: invoiceNumber,
      job_id: j.id,
      estimate_id: j.estimate_id || "",
      estimate_number: j.estimate_number || "",
      customer_name: j.customer_name || "",
      customer_address: j.customer_address || "",
      customer_phone: j.customer_phone || "",
      customer_email: customerEmail,
      job_type: j.job_type || "",
      job_description: j.job_description || "",
      photos_before: j.photos_before || [],
      photos_after: j.photos_after || [],
      line_items: estimate?.line_items || [],
      subtotal: estimate?.subtotal || j.total || 0,
      markup_percent: estimate?.markup_percent || 0,
      markup_amount: estimate?.markup_amount || 0,
      tax_percent: estimate?.tax_percent || 0,
      tax_amount: estimate?.tax_amount || 0,
      total: j.total || estimate?.total || 0,
      status: "draft",
      public_token: token,
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      notes: "(Customize notes later)",
    });

    // Link invoice back to the job (user-scoped, RLS applies)
    await base44.entities.Job.update(j.id, {
      invoice_id: invoice.id,
      invoice_status: "draft",
    });

    // Create a notification for the dashboard
    await base44.entities.Notification.create({
      type: "system",
      title: "Invoice Ready for Review",
      message: `Invoice ${invoiceNumber} for ${j.customer_name || "customer"} is ready to review and send.`,
      link: `/invoices/${invoice.id}`,
      job_id: j.id,
      read: false,
    });

    return Response.json({ success: true, invoice_id: invoice.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});