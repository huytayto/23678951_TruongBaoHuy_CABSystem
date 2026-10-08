const test = require('node:test');
const assert = require('node:assert/strict');
const {
  escapeResponseStrings,
  isValidCoordinates,
  isValidPassword,
  isValidSecret,
  isValidTripTransition,
} = require('../services/domain-rules');

test('coordinate validation accepts valid map bounds and rejects missing or out-of-range values', () => {
  assert.equal(isValidCoordinates(90, 180), true);
  assert.equal(isValidCoordinates('-90', '-180'), true);
  assert.equal(isValidCoordinates('', 0), false);
  assert.equal(isValidCoordinates(undefined, 0), false);
  assert.equal(isValidCoordinates(90.1, 0), false);
  assert.equal(isValidCoordinates(0, 'not-a-number'), false);
});

test('password validation enforces length and character classes', () => {
  assert.equal(isValidPassword('Password@123'), true);
  assert.equal(isValidPassword('password@123'), false);
  assert.equal(isValidPassword('PASSWORD@123'), false);
  assert.equal(isValidPassword('PasswordOnly!'), false);
  assert.equal(isValidPassword('Pass@1'), false);
  assert.equal(isValidPassword(`A1!${'a'.repeat(126)}`), false);
});

test('secrets reject short values and example placeholders', () => {
  assert.equal(isValidSecret('random-secret-value-that-is-long-enough-123456'), true);
  assert.equal(isValidSecret('replace-with-at-least-32-random-characters'), false);
  assert.equal(isValidSecret('short-secret'), false);
});

test('response string escaping neutralizes HTML while preserving JSON structure', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const escaped = escapeResponseStrings({
    comment: "<script>alert('x')</script>",
    count: 1,
    created_at: createdAt,
    values: ['<b>unsafe</b>'],
  });
  assert.deepEqual(escaped, {
    comment: '&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;',
    count: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    values: ['&lt;b&gt;unsafe&lt;/b&gt;'],
  });
});

test('trip transitions permit only the next state in the required sequence', () => {
  const valid = [
    ['DRIVER_ASSIGNED', 'EN_ROUTE'],
    ['EN_ROUTE', 'ARRIVED'],
    ['ARRIVED', 'PICKED_UP'],
    ['PICKED_UP', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'COMPLETED'],
  ];
  for (const [current, next] of valid) assert.equal(isValidTripTransition(current, next), true);
  assert.equal(isValidTripTransition('DRIVER_ASSIGNED', 'COMPLETED'), false);
  assert.equal(isValidTripTransition('EN_ROUTE', 'PICKED_UP'), false);
  assert.equal(isValidTripTransition('COMPLETED', 'EN_ROUTE'), false);
});
