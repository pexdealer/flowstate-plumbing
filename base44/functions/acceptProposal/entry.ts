import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const FINAL_STATUSES = new Set(['declined', 'expired', 'revoked']);

function isExpired(validUntil) {
  return Boolean(validUntil && new Date(`${validUntil}T23:59:59`).getTime() < Date.now());
}

async function ensureJob(base44, estimate, snapshot) {
  const existing = await base44.asServiceRole.entities.Job.filter({ estimate_id: estimate.id });
  if (existing?.[0]) {
    if (estimate.job_id !== existing[0].id) {
      await base44.asServiceRole.entities.Estimate.update(estimate.id, { job_id: existing[0].id });
    }
    return existing[0];
  }

  const job = await base44.asServiceRole.entities.Job.create({
    title: `${(snapshot.job_type || 'Job').replace(/_/g, ' ')} — ${snapshot.customer_name || 'Customer'}`,
    estimate_id: estimate.id,
    estimate_number: snapshot.estimate_number,
    customer_id: estimate.customer_id,
    customer_name: snapshot.customer_name,
    customer_phone: estimate.customer_phone || '',
    customer_address: snapshot.customer_address,
    job_type: snapshot.job_type,
    job_description: snapshot.job_description,
    line_items: estimate.line_items || [],
    total: estimate.total ?? snapshot.total,
    status: 'unscheduled',
    created_by_id: estimate.created_by_id,
  });
  await base44.asServiceRole.entities.Estimate.update(estimate.id, { job_id: job.id });
  return job;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (!token || name.length < 2 || name.length > 120) {
      return Response.json({ error: 'A valid proposal link and full name are required' }, { status: 400 });
    }

    const versions = await base44.asServiceRole.entities.ProposalVersion.filter({ public_token: token });
    const version = versions?.[0];
    if (version) {
      const estimates = await base44.asServiceRole.entities.Estimate.filter({ id: version.estimate_id });
      const estimate = estimates?.[0];
      if (!estimate) return Response.json({ error: 'Proposal not found' }, { status: 404 });
      const snapshot = version.snapshot || {};

      if (version.status === 'approved') {
        const job = await ensureJob(base44, estimate, snapshot);
        return Response.json({ ok: true, already: true, job_id: job.id });
      }
      if (FINAL_STATUSES.has(version.status)) {
        return Response.json({ error: `This proposal is ${version.status}` }, { status: 409 });
      }
      if (isExpired(snapshot.valid_until)) {
        await base44.asServiceRole.entities.ProposalVersion.update(version.id, { status: 'expired' });
        await base44.asServiceRole.entities.Estimate.update(estimate.id, { status: 'expired' });
        return Response.json({ error: 'This proposal has expired' }, { status: 410 });
      }
      if (estimate.active_proposal_version_id && estimate.active_proposal_version_id !== version.id) {
        return Response.json({ error: 'A newer proposal version is available' }, { status: 409 });
      }

      const now = new Date().toISOString();
      const acceptance = {
        status: 'approved',
        accepted_at: now,
        accepted_by_name: name,
        accepted_ip: req.headers.get('x-forwarded-for') || '',
        accepted_user_agent: req.headers.get('user-agent') || '',
      };
      await base44.asServiceRole.entities.ProposalVersion.update(version.id, acceptance);
      await base44.asServiceRole.entities.Estimate.update(estimate.id, {
        status: 'approved',
        accepted_at: now,
        accepted_by_name: name,
        accepted_signature: name,
        accepted_ip: acceptance.accepted_ip,
      });

      const job = await ensureJob(base44, estimate, snapshot);
      await base44.asServiceRole.entities.Notification.create({
        type: 'estimate_accepted',
        title: 'Estimate accepted',
        message: `${snapshot.customer_name} accepted estimate #${snapshot.estimate_number || ''} ($${(Number(snapshot.total) || 0).toFixed(2)}).`,
        estimate_id: estimate.id,
        job_id: job.id,
        link: `/estimates/${estimate.id}`,
        read: false,
        created_by_id: estimate.created_by_id,
      });

      if (estimate.created_by_id) {
        try {
          const owners = await base44.asServiceRole.entities.User.filter({ id: estimate.created_by_id });
          const ownerEmail = owners?.[0]?.email;
          if (ownerEmail) {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: ownerEmail,
              subject: `Estimate #${snapshot.estimate_number || ''} accepted`,
              body:
                `${snapshot.customer_name} accepted proposal version ${version.version_number}.\n\n` +
                `Job: ${snapshot.job_type || 'Job'}\n` +
                `Total: $${(Number(snapshot.total) || 0).toFixed(2)}\n\n` +
                `Open Genesis Handyman Solutions to schedule the job.`,
            });
          }
        } catch (_) { /* Acceptance must not fail because an alert could not be sent. */ }
      }

      return Response.json({ ok: true, job_id: job.id, version: version.version_number });
    }

    const matches = await base44.asServiceRole.entities.Estimate.filter({ public_token: token });
    const estimate = matches?.[0];
    if (!estimate) return Response.json({ error: 'Proposal not found' }, { status: 404 });
    if (estimate.status === 'approved') {
      const job = await ensureJob(base44, estimate, estimate);
      return Response.json({ ok: true, already: true, job_id: job.id });
    }
    if (FINAL_STATUSES.has(estimate.status) || isExpired(estimate.valid_until)) {
      return Response.json({ error: 'This proposal is no longer available' }, { status: 409 });
    }

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.Estimate.update(estimate.id, {
      status: 'approved',
      accepted_at: now,
      accepted_by_name: name,
      accepted_signature: name,
      accepted_ip: req.headers.get('x-forwarded-for') || '',
    });
    const job = await ensureJob(base44, estimate, estimate);
    return Response.json({ ok: true, job_id: job.id, legacy: true });
  } catch (_) {
    return Response.json({ error: 'Unable to accept proposal' }, { status: 500 });
  }
}
