import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildPublicProposal } from '../../shared/publicDocuments.ts';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token || token.length > 128) {
      return Response.json({ error: 'Invalid proposal link' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const versions = await base44.asServiceRole.entities.ProposalVersion.filter({ public_token: token });
    const version = versions?.[0];
    if (version) {
      if (version.status === 'revoked') {
        return Response.json({ error: 'Proposal link is no longer available' }, { status: 410, headers: NO_STORE_HEADERS });
      }

      const snapshot = version.snapshot || {};
      if (snapshot.valid_until && new Date(`${snapshot.valid_until}T23:59:59`).getTime() < Date.now()) {
        if (!['approved', 'declined', 'expired'].includes(version.status)) {
          try {
            await base44.asServiceRole.entities.ProposalVersion.update(version.id, { status: 'expired' });
          } catch (_) { /* The expired response is still authoritative. */ }
        }
        return Response.json({ error: 'Proposal link has expired' }, { status: 410, headers: NO_STORE_HEADERS });
      }

      if (!version.viewed_at) {
        try {
          await base44.asServiceRole.entities.ProposalVersion.update(version.id, {
            viewed_at: new Date().toISOString(),
            status: version.status === 'sent' ? 'viewed' : version.status,
          });
        } catch (_) { /* Viewing must still work if tracking fails. */ }
      }

      return Response.json({
        estimate: {
          ...snapshot,
          status: version.status === 'viewed' ? 'sent' : version.status,
          accepted_at: version.accepted_at,
          accepted_by_name: version.accepted_by_name,
          declined_at: version.declined_at,
        },
        business: { name: 'Genesis Handyman Solutions' },
        version: version.version_number,
      }, { headers: NO_STORE_HEADERS });
    }

    // Backward compatibility for links created before proposal versioning.
    const matches = await base44.asServiceRole.entities.Estimate.filter({ public_token: token });
    const est = matches?.[0];
    if (!est) return Response.json({ error: 'Proposal not found' }, { status: 404, headers: NO_STORE_HEADERS });

    if (est.public_token_revoked_at) {
      return Response.json({ error: 'Proposal link is no longer available' }, { status: 410, headers: NO_STORE_HEADERS });
    }

    // Record the first view (best-effort, non-blocking).
    if (!est.viewed_at) {
      try {
        await base44.asServiceRole.entities.Estimate.update(est.id, { viewed_at: new Date().toISOString() });
      } catch (_) { /* ignore */ }
    }

    // Explicit allowlist: internal costs, inventory IDs, SKU, markup, notes,
    // ownership fields, and security metadata must never enter this payload.
    const safe = buildPublicProposal(est);

    return Response.json(
      { estimate: safe, business: { name: 'Genesis Handyman Solutions' } },
      { headers: NO_STORE_HEADERS },
    );
  } catch (_) {
    return Response.json({ error: 'Unable to load proposal' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}