const { Pool } = require('pg');

const checks = {
  customer: {
    sql: `SELECT fullname AS first_value, address AS second_value FROM customers ORDER BY created_at DESC LIMIT 1`,
    key: process.env.CUSTOMER_DATA_ENCRYPTION_KEY,
  },
  driver: {
    sql: `SELECT license_number AS first_value, plate_number AS second_value FROM drivers ORDER BY created_at DESC LIMIT 1`,
    key: process.env.DRIVER_DATA_ENCRYPTION_KEY,
  },
};

async function main() {
  const context = process.argv[2];
  const check = checks[context];
  if (!check || !check.key) throw new Error('Choose customer or driver; its encryption key must be configured');

  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  try {
    const result = await pool.query(check.sql);
    if (!result.rows[0]) throw new Error(`No ${context} records exist; create a record before verification`);
    const { first_value: first, second_value: second } = result.rows[0];
    if (![first, second].every((value) => typeof value === 'string' && value.startsWith('enc:v1:'))) {
      throw new Error(`${context} fields are not stored in the expected AES-GCM envelope`);
    }
    console.log(`${context} sensitive fields are encrypted at rest; plaintext was not displayed`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('At-rest encryption verification failed:', error.message);
  process.exitCode = 1;
});
