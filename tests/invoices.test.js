import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, money } from '../base44/functions/_shared/invoices.js';

test('payment calculations convert dollars to integer cents', () => {
  assert.equal(cents(75), 7500);
  assert.equal(cents(19.995), 2000);
  assert.equal(cents('12.34'), 1234);
});

test('invoice money values round to two decimals', () => {
  assert.equal(money(10.005), 10.01);
  assert.equal(money(undefined), 0);
});
