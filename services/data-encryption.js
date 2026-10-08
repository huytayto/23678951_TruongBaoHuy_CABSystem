const crypto = require('crypto');

function loadEncryptionKey(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)
    || /^([a-f0-9])\1{63}$/i.test(value)) {
    throw new Error('Data encryption key must be a non-placeholder 32-byte hex value');
  }
  return Buffer.from(value, 'hex');
}

function encryptField(value, key) {
  if (value === null || value === undefined) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptField(value, key) {
  if (value === null || value === undefined) return value;
  const [prefix, version, ivValue, tagValue, encryptedValue] = String(value).split(':');
  if (prefix !== 'enc' || version !== 'v1' || !ivValue || !tagValue || encryptedValue === undefined) {
    throw new Error('Encrypted database field has an unsupported format');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function lookupHash(value, purpose, key) {
  return crypto.createHmac('sha256', key)
    .update(`${purpose}:${String(value).trim().toLowerCase()}`, 'utf8')
    .digest('hex');
}

module.exports = { decryptField, encryptField, loadEncryptionKey, lookupHash };
