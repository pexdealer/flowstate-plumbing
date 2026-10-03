import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildPublicProposal } from '../_shared/publicDocuments.js';

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function publicUrl(token) {
  const origin = Deno.env.get('PUBLIC_APP_ORIGIN') || 'https://plumbest.base44.app';
  return `${origin}/p/${token}`;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const estimateId = typeof body.estimate_id === 'string' ? body.estimate_id : '';
    const requestedChannel = body.channel === 'email' ? 'email' : 'manual_link';
    if (!estimateId) return Response.json({ error: 'Estimate ID required' }, { status: 400 });

    // User-scoped load is the authorization check.
    const matches = await base44.entities.Estimate.filter({ id: estimateId });
    const estimate = matches?.[0];
    if (!estimate) return Response.json({ error: 'Estimate not found' }, { status: 404 });
    if (estimate.status === 'approved') {
      return Response.json({ error: 'Approved estimates cannot be resent. Create a revision instead.' }, { status: 409 });
    }
    if (!estimate.customer_name || !estimate.job_description) {
      return Response.json({ error: 'Customer name and scope of work are required' }, { status: 400 });
    }
    if (!Array.isArray(estimate.line_items) || !estimate.line_items.some((item) => item.description && Number(item.total) >= 0)) {
      return Response.json({ error: 'At least one complete line item is required' }, { status: 400 });
    }

    const snapshot = buildPublicProposal({ ...estimate, status: 'sent' });
    const versionNumber = (Number(estimate.proposal_version_number) || 0) + 1;
    const token = crypto.randomUUID();
    const documentHash = await sha256(JSON.stringify(snapshot));
    const now = new Date().toISOString();
    let email = String(estimate.customer_email || '').trim();

    if (!email && estimate.customer_id) {
      const customers = await base44.entities.Customer.filter({ id: estimate.customer_id });
      email = String(customers?.[0]?.email || '').trim();
    }
    if (requestedChannel === 'email' && !email) {
      return Response.json({ error: 'Add a customer email before sending by email' }, { status: 400 });
    }

    if (estimate.active_proposal_version_id) {
      const active = await base44.entities.ProposalVersion.filter({ id: estimate.active_proposal_version_id });
      const previous = active?.[0];
      if (previous && !['approved', 'declined', 'expired', 'revoked'].includes(previous.status)) {
        await base44.entities.ProposalVersion.update(previous.id, { status: 'revoked', revoked_at: now });
      }
    }

    const version = await base44.entities.ProposalVersion.create({
      estimate_id: estimate.id,
      version_number: versionNumber,
      public_token: token,
      document_hash: documentHash,
      snapshot,
      status: 'sent',
      delivery_channel: requestedChannel,
      delivery_status: requestedChannel === 'email' ? 'delivered' : 'prepared',
      sent_to: requestedChannel === 'email' ? email : '',
      sent_at: now,
    });

    const url = publicUrl(token);
    if (requestedChannel === 'email') {
      try {
        await base44.integrations.Core.SendEmail({
          to: email,
          subject: `Estimate #${estimate.estimate_number || ''} from Genesis Handyman Solutions`,
          body:
            `Hello ${estimate.customer_name},\n\n` +
            `Your estimate is ready to review.\n\n` +
            `Total: $${(Number(estimate.total) || 0).toFixed(2)}\n` +
            `Review the complete scope and respond here:\n${url}\n\n` +
            `Thank you,\nGenesis Handyman Solutions`,
          from_name: 'Genesis Handyman Solutions',
        });
      } catch (_) {
        await base44.entities.ProposalVersion.update(version.id, { delivery_status: 'failed' });
        return Response.json({ error: 'The proposal was prepared, but email delivery failed', url }, { status: 502 });
      }
    }

    const estimateUpdate: Record<string, unknown> = {
      public_token: token,
      active_proposal_version_id: version.id,
      proposal_version_number: versionNumber,
      status: requestedChannel === 'email' ? 'sent' : 'draft',
      delivery_channel: requestedChannel,
      delivery_status: requestedChannel === 'email' ? 'delivered' : 'prepared',
    };
    if (requestedChannel === 'email') estimateUpdate.sent_at = now;
    await base44.entities.Estimate.update(estimate.id, estimateUpdate);

    return Response.json({
      ok: true,
      url,
      token,
      version_number: versionNumber,
      delivered: requestedChannel === 'email',
      channel: requestedChannel,
    });
  } catch (_) {
    return Response.json({ error: 'Unable to prepare proposal' }, { status: 500 });
  }
}
