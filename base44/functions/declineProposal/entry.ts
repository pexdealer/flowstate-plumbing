import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) return Response.json({ error: 'Proposal link required' }, { status: 400 });

    const versions = await base44.asServiceRole.entities.ProposalVersion.filter({ public_token: token });
    const version = versions?.[0];
    if (version) {
      if (version.status === 'approved') {
        return Response.json({ error: 'An approved proposal cannot be declined' }, { status: 409 });
      }
      if (version.status === 'declined') return Response.json({ ok: true, already: true });
      if (['expired', 'revoked'].includes(version.status)) {
        return Response.json({ error: `This proposal is ${version.status}` }, { status: 409 });
      }

      const estimates = await base44.asServiceRole.entities.Estimate.filter({ id: version.estimate_id });
      const estimate = estimates?.[0];
      if (!estimate) return Response.json({ error: 'Proposal not found' }, { status: 404 });
      if (estimate.active_proposal_version_id && estimate.active_proposal_version_id !== version.id) {
        return Response.json({ error: 'A newer proposal version is available' }, { status: 409 });
      }

      const now = new Date().toISOString();
      await base44.asServiceRole.entities.ProposalVersion.update(version.id, { status: 'declined', declined_at: now });
      await base44.asServiceRole.entities.Estimate.update(estimate.id, { status: 'declined', declined_at: now });
      await base44.asServiceRole.entities.Notification.create({
        type: 'estimate_declined',
        title: 'Estimate declined',
        message: `${version.snapshot?.customer_name || estimate.customer_name} declined estimate #${version.snapshot?.estimate_number || estimate.estimate_number || ''}.`,
        estimate_id: estimate.id,
        link: `/estimates/${estimate.id}`,
        read: false,
        created_by_id: estimate.created_by_id,
      });
      return Response.json({ ok: true });
    }

    const matches = await base44.asServiceRole.entities.Estimate.filter({ public_token: token });
    const estimate = matches?.[0];
    if (!estimate) return Response.json({ error: 'Proposal not found' }, { status: 404 });
    if (estimate.status === 'approved') {
      return Response.json({ error: 'An approved proposal cannot be declined' }, { status: 409 });
    }
    if (estimate.status === 'declined') return Response.json({ ok: true, already: true });
    if (estimate.status === 'expired') {
      return Response.json({ error: 'This proposal has expired' }, { status: 409 });
    }

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.Estimate.update(estimate.id, { status: 'declined', declined_at: now });
    await base44.asServiceRole.entities.Notification.create({
      type: 'estimate_declined',
      title: 'Estimate declined',
      message: `${estimate.customer_name} declined estimate #${estimate.estimate_number || ''}.`,
      estimate_id: estimate.id,
      link: `/estimates/${estimate.id}`,
      read: false,
      created_by_id: estimate.created_by_id,
    });
    return Response.json({ ok: true, legacy: true });
  } catch (_) {
    return Response.json({ error: 'Unable to decline proposal' }, { status: 500 });
  }
}
