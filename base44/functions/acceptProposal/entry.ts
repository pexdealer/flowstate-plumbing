import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const { token, name } = await req.json();
    if (!token || !name) return Response.json({ error: 'missing fields' }, { status: 400 });

    const matches = await base44.asServiceRole.entities.Estimate.filter({ public_token: token });
    const est = matches?.[0];
    if (!est) return Response.json({ error: 'not found' }, { status: 404 });
    if (est.status === 'approved') return Response.json({ ok: true, already: true });

    const now = new Date().toISOString();
    const ip = req.headers.get('x-forwarded-for') || '';

    await base44.asServiceRole.entities.Estimate.update(est.id, {
      status: 'approved',
      accepted_at: now,
      accepted_by_name: name,
      accepted_signature: name,
      accepted_ip: ip,
    });

    // Auto-create the dispatch job, preserving the original owner.
    const job = await base44.asServiceRole.entities.Job.create({
      title: `${(est.job_type || 'Job').replace(/_/g, ' ')} — ${est.customer_name || 'Customer'}`,
      estimate_id: est.id,
      estimate_number: est.estimate_number,
      customer_id: est.customer_id,
      customer_name: est.customer_name,
      customer_address: est.customer_address,
      job_type: est.job_type,
      job_description: est.job_description,
      line_items: est.line_items,
      total: est.total,
      status: 'unscheduled',
      created_by_id: est.created_by_id,
    });
    await base44.asServiceRole.entities.Estimate.update(est.id, { job_id: job.id });

    // In-app notification for the owner.
    await base44.asServiceRole.entities.Notification.create({
      type: 'estimate_accepted',
      title: 'Estimate accepted',
      message: `${est.customer_name} accepted estimate #${est.estimate_number || ''} ($${(est.total || 0).toFixed(2)}).`,
      estimate_id: est.id,
      job_id: job.id,
      link: `/estimates/${est.id}`,
      read: false,
    });

    // Best-effort email to the plumber (registered user).
    if (est.created_by_id) {
      try {
        const owners = await base44.asServiceRole.entities.User.filter({ id: est.created_by_id });
        const ownerEmail = owners?.[0]?.email;
        if (ownerEmail) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: ownerEmail,
            subject: `✅ ${est.customer_name} accepted estimate #${est.estimate_number || ''}`,
            body:
              `${est.customer_name} just accepted their estimate.\n\n` +
              `Job: ${est.job_type}\nAddress: ${est.customer_address || '—'}\n` +
              `Total: $${(est.total || 0).toFixed(2)}\n\n` +
              `Open it in Genesis Handyman Solutions to schedule and dispatch.`,
          });
        }
      } catch (_) { /* don't fail acceptance if email hiccups */ }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}