import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicInvoice,
  buildPublicProposal,
  customerPricing,
} from '../base44/functions/_shared/publicDocuments.js';

const internalDocument = {
  estimate_number: 'EST-100',
  invoice_number: 'INV-100',
  customer_name: 'Customer',
  customer_address: 'Job site',
  customer_email: 'private@example.com',
  customer_phone: '555-0100',
  job_type: 'repair',
  job_description: 'Repair described',
  line_items: [
    { type: 'material', item_id: 'secret-id', sku: 'SECRET-SKU', description: 'Part', quantity: 2, unit_price: 25, total: 50 },
    { type: 'labor', description: 'Labor', quantity: 1, unit_price: 50, total: 50 },
  ],
  subtotal: 100,
  markup_percent: 20,
  markup_amount: 20,
  tax_percent: 5,
  tax_amount: 6,
  total: 126,
  notes: 'Internal note',
  accepted_ip: '127.0.0.1',
  created_by_id: 'owner-id',
  status: 'sent',
};

test('customer pricing folds markup into selling prices', () => {
  const pricing = customerPricing(internalDocument);
  assert.equal(pricing.customerSubtotal, 120);
  assert.deepEqual(pricing.lineItems.map((item) => item.total), [60, 60]);
  assert.equal(pricing.lineItems.reduce((sum, item) => sum + item.total, 0), 120);
});

test('public proposal does not expose internal pricing or security fields', () => {
  const proposal = buildPublicProposal(internalDocument);
  for (const forbidden of ['markup_percent', 'markup_amount', 'item_id', 'sku', 'notes', 'accepted_ip', 'created_by_id']) {
    assert.equal(Object.hasOwn(proposal, forbidden), false, `${forbidden} leaked into proposal`);
    assert.equal(proposal.line_items.some((item) => Object.hasOwn(item, forbidden)), false, `${forbidden} leaked into proposal line items`);
  }
});

test('public invoice uses an explicit safe field allowlist', () => {
  const invoice = buildPublicInvoice(internalDocument);
  for (const forbidden of ['customer_email', 'customer_phone', 'markup_percent', 'markup_amount', 'item_id', 'sku', 'notes', 'created_by_id']) {
    assert.equal(Object.hasOwn(invoice, forbidden), false, `${forbidden} leaked into invoice`);
    assert.equal(invoice.line_items.some((item) => Object.hasOwn(item, forbidden)), false, `${forbidden} leaked into invoice line items`);
  }
  assert.equal(invoice.subtotal, 120);
  assert.equal(invoice.total, 126);
});
