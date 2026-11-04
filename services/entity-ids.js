// These values are primary keys, not aliases. PostgreSQL sequences allocate them atomically.
const definitions = {
  admin: { prefix: 'a', sequence: 'user_admin_id_seq', table: 'users', column: 'uid', context: 'auth', reserve: 1 },
  customer: { prefix: 'c', sequence: 'user_customer_id_seq', table: 'users', column: 'uid', context: 'auth', reserve: 5 },
  driver: { prefix: 'd', sequence: 'user_driver_id_seq', table: 'users', column: 'uid', context: 'auth', reserve: 10 },
  booking: { prefix: 'b', sequence: 'booking_id_seq', table: 'bookings', column: 'booking_id', context: 'booking' },
  trip: { prefix: 't', sequence: 'trip_id_seq', table: 'trips', column: 'trip_id', context: 'trip' },
  rating: { prefix: 'r', sequence: 'rating_id_seq', table: 'ratings', column: 'rating_id', context: 'trip' },
  payment: { prefix: 'p', sequence: 'payment_id_seq', table: 'payments', column: 'payment_id', context: 'payment' },
};

function isEntityId(kind, value) {
  return !!definitions[kind] && typeof value === 'string'
    && new RegExp(`^${definitions[kind].prefix}[1-9][0-9]{0,14}$`).test(value);
}

async function ensureIdSequences(pool, context, smokeMode = false) {
  for (const entity of Object.values(definitions).filter(d => d.context === context)) {
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS ${entity.sequence} START WITH ${1 + (smokeMode ? entity.reserve || 0 : 0)}`);
  }
}

async function nextId(pool, kind) {
  const entity = definitions[kind];
  if (!entity) throw new Error('Unknown entity kind');
  return (await pool.query('SELECT $1::text || nextval($2::regclass)::text AS id', [entity.prefix, entity.sequence])).rows[0].id;
}

async function syncIdSequences(pool, context, smokeMode = false) {
  await ensureIdSequences(pool, context, smokeMode);
  for (const entity of Object.values(definitions).filter(d => d.context === context)) {
    const maximum = Number((await pool.query(`SELECT COALESCE(max(substring(${entity.column} from 2)::bigint),0) AS value
      FROM ${entity.table} WHERE ${entity.column} ~ $1`, [`^${entity.prefix}[1-9][0-9]*$`])).rows[0].value);
    const value = Math.max(maximum, smokeMode ? entity.reserve || 0 : 0);
    await pool.query('SELECT setval($1::regclass,$2,$3)', [entity.sequence, Math.max(1, value), value > 0]);
  }
}

module.exports = { definitions, isEntityId, ensureIdSequences, nextId, syncIdSequences };
