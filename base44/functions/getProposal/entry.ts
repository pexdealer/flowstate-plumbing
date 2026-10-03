import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const { token } = await req.json();
    if (!token) return Response.json({ error: 'missing token' }, { status: 400 });

    const matches = await base44.asServiceRole.entities.Estimate.filter({ public_token: token });
    const est = matches?.[0];
    if (!est) return Response.json({ error: 'not found' }, { status: 404 });

    // Record the first view (best-effort, non-blocking).
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

    return Response.json({ estimate: safe, business: { name: 'Genesis Handyman Solutions' } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}