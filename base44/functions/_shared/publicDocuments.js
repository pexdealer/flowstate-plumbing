export function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function customerPricing(document) {
  const sourceItems = Array.isArray(document.line_items) ? document.line_items : [];
  const internalSubtotal = roundCurrency(document.subtotal);
  const customerSubtotal = roundCurrency(internalSubtotal + (Number(document.markup_amount) || 0));
  const multiplier = internalSubtotal > 0 ? customerSubtotal / internalSubtotal : 1;

  let allocated = 0;
  const lineItems = sourceItems.map((item, index) => {
    const quantity = Number(item.quantity) || 0;
    const internalTotal = Number(item.total) || quantity * (Number(item.unit_price) || 0);
    const isLast = index === sourceItems.length - 1;
    const total = isLast
      ? roundCurrency(customerSubtotal - allocated)
      : roundCurrency(internalTotal * multiplier);
    allocated = roundCurrency(allocated + total);

    return {
      type: item.type || 'other',
      description: String(item.description || '').trim(),
      quantity,
      unit_price: quantity > 0 ? roundCurrency(total / quantity) : total,
      total,
    };
  });

  return { lineItems, customerSubtotal };
}

export function buildPublicProposal(estimate) {
  const { lineItems, customerSubtotal } = customerPricing(estimate);
  return {
    estimate_number: estimate.estimate_number,
    customer_name: estimate.customer_name,
    customer_address: estimate.customer_address,
    job_type: estimate.job_type,
    job_description: estimate.job_description,
    line_items: lineItems,
    subtotal: customerSubtotal,
    tax_percent: roundCurrency(estimate.tax_percent),
    tax_amount: roundCurrency(estimate.tax_amount),
    cash_discount_percent: roundCurrency(estimate.cash_discount_percent),
    discount_amount: roundCurrency(estimate.discount_amount),
    total: roundCurrency(estimate.total),
    status: estimate.status,
    valid_until: estimate.valid_until,
    customer_notes: estimate.customer_notes || '',
    accepted_at: estimate.accepted_at,
    accepted_by_name: estimate.accepted_by_name,
    declined_at: estimate.declined_at,
  };
}

export function buildPublicInvoice(invoice) {
  const { lineItems, customerSubtotal } = customerPricing(invoice);
  return {
    invoice_number: invoice.invoice_number,
    estimate_number: invoice.estimate_number,
    customer_name: invoice.customer_name,
    customer_address: invoice.customer_address,
    job_type: invoice.job_type,
    job_description: invoice.job_description,
    line_items: lineItems,
    subtotal: customerSubtotal,
    tax_percent: roundCurrency(invoice.tax_percent),
    tax_amount: roundCurrency(invoice.tax_amount),
    cash_discount_percent: roundCurrency(invoice.cash_discount_percent),
    discount_amount: roundCurrency(invoice.discount_amount),
    total: roundCurrency(invoice.total),
    amount_paid_cents: Number(invoice.amount_paid_cents) || 0,
    balance_due_cents: Number.isInteger(invoice.balance_due_cents)
      ? invoice.balance_due_cents
      : Math.round((Number(invoice.total) || 0) * 100),
    payment_status: invoice.payment_status || (invoice.status === 'paid' ? 'paid' : 'unpaid'),
    payment_link: invoice.payment_link || '',
    status: invoice.status,
    due_date: invoice.due_date,
    sent_at: invoice.sent_at,
    paid_at: invoice.paid_at,
    customer_notes: invoice.customer_notes || '',
    photos_before: Array.isArray(invoice.photos_before) ? invoice.photos_before : [],
    photos_after: Array.isArray(invoice.photos_after) ? invoice.photos_after : [],
  };
}