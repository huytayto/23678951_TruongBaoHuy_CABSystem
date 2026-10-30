// Readable codes are aliases. UUIDs remain the internal identifiers.
const entities = {
  customer: { table: 'customers', id: 'uid', prefix: 'C' },
  driver: { table: 'drivers', id: 'uid', prefix: 'D' },
  booking: { table: 'bookings', id: 'booking_id', prefix: 'B' },
  trip: { table: 'trips', id: 'trip_id', prefix: 'T' },
  payment: { table: 'payments', id: 'payment_id', prefix: 'P' },
};

async function ensurePublicCodes(pool, context) {
  const entity = entities[context];
  if (!entity) return;
  const { table, prefix } = entity;
  // SQL identifiers come only from the whitelist above, never from requests.
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS ${table}_code_seq`);
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS code TEXT`);
  await pool.query(`ALTER TABLE ${table} ALTER COLUMN code SET DEFAULT ('${prefix}' || nextval('${table}_code_seq'))`);
  await pool.query(`UPDATE ${table} SET code = '${prefix}' || nextval('${table}_code_seq') WHERE code IS NULL`);
  await pool.query(`ALTER TABLE ${table} ALTER COLUMN code SET NOT NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${table}_code_unique ON ${table}(code)`);
}

function isPublicCode(context, value) {
  const entity = entities[context];
  return !!entity && typeof value === 'string' && new RegExp(`^${entity.prefix}[1-9][0-9]{0,14}$`, 'i').test(value);
}

async function resolvePublicCode(pool, context, code) {
  const entity = entities[context];
  if (!isPublicCode(context, code)) return null;
  const result = await pool.query(`SELECT ${entity.id} AS id, code FROM ${entity.table} WHERE code = $1`, [code.toUpperCase()]);
  return result.rows[0] || null;
}

module.exports = { ensurePublicCodes, isPublicCode, resolvePublicCode };
