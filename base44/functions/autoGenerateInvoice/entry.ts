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

    // Fetch the original estimate for line items
    let estimate = null;
    if (job.estimate_id) {
      const estData = await base44.asServiceRole.entities.Estimate.filter({ id: job.estimate_id });
      estimate = estData?.[0];
    }

    // Fetch customer email
    let customerEmail = "";
    if (job.customer_id) {
      const custData = await base44.asServiceRole.entities.Customer.filter({ id: job.customer_id });
      customerEmail = custData?.[0]?.email || "";
    }

    // Generate a public token and invoice number
    const token = crypto.randomUUID();
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

    const invoice = await base44.asServiceRole.entities.Invoice.create({
      invoice_number: invoiceNumber,
      job_id: job.id,
      estimate_id: job.estimate_id || "",
      estimate_number: job.estimate_number || "",
      customer_name: job.customer_name || "",
      customer_address: job.customer_address || "",
      customer_phone: job.customer_phone || "",
      customer_email: customerEmail,
      job_type: job.job_type || "",
      job_description: job.job_description || "",
      photos_before: job.photos_before || [],
      photos_after: job.photos_after || [],
      line_items: estimate?.line_items || [],
      subtotal: estimate?.subtotal || job.total || 0,
      markup_percent: estimate?.markup_percent || 0,
      markup_amount: estimate?.markup_amount || 0,
      tax_percent: estimate?.tax_percent || 0,
      tax_amount: estimate?.tax_amount || 0,
      total: job.total || estimate?.total || 0,
      status: "draft",
      public_token: token,
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      notes: "(Customize notes later)",
    });

    // Link invoice back to the job
    await base44.asServiceRole.entities.Job.update(job.id, {
      invoice_id: invoice.id,
      invoice_status: "draft",
    });

    // Create a notification for the dashboard
    await base44.asServiceRole.entities.Notification.create({
      type: "system",
      title: "Invoice Ready for Review",
      message: `Invoice ${invoiceNumber} for ${job.customer_name || "customer"} is ready to review and send.`,
      link: `/invoices/${invoice.id}`,
      job_id: job.id,
      read: false,
    });

    return Response.json({ success: true, invoice_id: invoice.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});