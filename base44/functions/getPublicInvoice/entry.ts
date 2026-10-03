import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildPublicInvoice } from '../_shared/publicDocuments.js';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

async function signPhotos(base44, values) {
  if (!Array.isArray(values) || !values.length) return [];
  const signed = await Promise.allSettled(values.map((fileUri) =>
    base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri })
  ));
  return values.flatMap((value, index) => {
    const result = signed[index];
    if (result.status === 'fulfilled' && result.value?.signed_url) {
      return [result.value.signed_url];
    }
    // Older public photo URLs can still be displayed. Never return a private URI.
    return /^https:\/\//i.test(value) ? [value] : [];
  });
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token || token.length > 128) {
      return Response.json({ error: 'Invalid invoice link' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const matches = await base44.asServiceRole.entities.Invoice.filter({ public_token: token });
    const invoice = matches?.[0];
    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    if (invoice.public_token_revoked_at) {
      return Response.json({ error: 'Invoice link is no longer available' }, { status: 410, headers: NO_STORE_HEADERS });
    }
    if (invoice.public_token_expires_at && new Date(invoice.public_token_expires_at).getTime() < Date.now()) {
      return Response.json({ error: 'Invoice link has expired' }, { status: 410, headers: NO_STORE_HEADERS });
    }

    if (!invoice.viewed_at) {
      try {
        await base44.asServiceRole.entities.Invoice.update(invoice.id, { viewed_at: new Date().toISOString() });
      } catch (_) { /* Viewing must still work if tracking fails. */ }
    }

    const safeInvoice = buildPublicInvoice(invoice);
    const [photosBefore, photosAfter] = await Promise.all([
      signPhotos(base44, invoice.photos_before),
      signPhotos(base44, invoice.photos_after),
    ]);
    safeInvoice.photos_before = photosBefore;
    safeInvoice.photos_after = photosAfter;

    return Response.json(
      { invoice: safeInvoice, business: { name: 'Genesis Handyman Solutions' } },
      { headers: NO_STORE_HEADERS },
    );
  } catch (_) {
    return Response.json({ error: 'Unable to load invoice' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
