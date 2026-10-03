import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const { token } = await req.json();
    if (!token) return Response.json({ error: 'missing token' }, { status: 400 });

    const matches = await base44.asServiceRole.entities.Invoice.filter({ public_token: token });
    const inv = matches?.[0];
    if (!inv) return Response.json({ error: 'not found' }, { status: 404 });

    // Record the first view (best-effort, non-blocking).
    if (!inv.viewed_at) {
      try {
        await base44.asServiceRole.entities.Invoice.update(inv.id, { viewed_at: new Date().toISOString() });
      } catch (_) { /* ignore */ }
    }

    // Photos are private files: mint short-lived signed URLs for display.
    // Anything that is not a private file (legacy public URLs) falls back to itself.
    const signPhotos = async (uris) => {
      if (!Array.isArray(uris) || !uris.length) return [];
      const results = await Promise.allSettled(
        uris.map((uri) => base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: uri }))
      );
      return uris.map((uri, i) => {
        const r = results[i];
        return r.status === 'fulfilled' && r.value?.signed_url ? r.value.signed_url : uri;
      });
    };

    const [photos_before, photos_after] = await Promise.all([
      signPhotos(inv.photos_before),
      signPhotos(inv.photos_after),
    ]);

    // Return only what the customer should see.
    const safe = {
      invoice_number: inv.invoice_number,
      estimate_number: inv.estimate_number,
      customer_name: inv.customer_name,
      customer_address: inv.customer_address,
      customer_phone: inv.customer_phone,
      job_type: inv.job_type,
      job_description: inv.job_description,
      line_items: inv.line_items,
      subtotal: inv.subtotal,
      markup_percent: inv.markup_percent,
      markup_amount: inv.markup_amount,
      tax_percent: inv.tax_percent,
      tax_amount: inv.tax_amount,
      total: inv.total,
      status: inv.status,
      due_date: inv.due_date,
      sent_at: inv.sent_at,
      paid_at: inv.paid_at,
      notes: inv.notes,
      photos_before,
      photos_after,
    };

    return Response.json({ invoice: safe });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}