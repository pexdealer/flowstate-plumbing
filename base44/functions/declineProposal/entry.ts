import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const { token } = await req.json();
    if (!token) return Response.json({ error: 'missing token' }, { status: 400 });

    const matches = await base44.asServiceRole.entities.Estimate.filter({ public_token: token });
    const est = matches?.[0];
    if (!est) return Response.json({ error: 'not found' }, { status: 404 });

    await base44.asServiceRole.entities.Estimate.update(est.id, {
      status: 'declined',
      declined_at: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.Notification.create({
      type: 'estimate_declined',
      title: 'Estimate declined',
      message: `${est.customer_name} declined estimate #${est.estimate_number || ''}.`,
      estimate_id: est.id,
      link: `/estimates/${est.id}`,
      read: false,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}