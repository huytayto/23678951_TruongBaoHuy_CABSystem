const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decryptField,
  encryptField,
  loadEncryptionKey,
  lookupHash,
} = require('../services/data-encryption');

const key = Buffer.alloc(32, 23);

test('AES-GCM field encryption is non-plaintext, randomized, and decryptable with the same key', () => {
  const first = encryptField('Sensitive customer address', key);
  const second = encryptField('Sensitive customer address', key);

  assert.match(first, /^enc:v1:/);
  assert.notEqual(first, 'Sensitive customer address');
  assert.notEqual(first, second);
  assert.equal(decryptField(first, key), 'Sensitive customer address');
});

test('AES-GCM rejects tampered ciphertext and invalid encryption keys', () => {
  const encrypted = encryptField('driver license', key);
  const parts = encrypted.split(':');
  parts[4] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptField(parts.join(':'), key));
  assert.throws(() => loadEncryptionKey('placeholder'));
  assert.throws(() => loadEncryptionKey('0'.repeat(64)));
  assert.equal(loadEncryptionKey('a7'.repeat(32)).length, 32);
});

test('lookup hashes are stable per key and purpose without exposing source values', () => {
  const hash = lookupHash('  ABC-123  ', 'plate', key);
  assert.equal(hash, lookupHash('abc-123', 'plate', key));
  assert.notEqual(hash, lookupHash('abc-123', 'license', key));
  assert.notEqual(hash, 'abc-123');
});
