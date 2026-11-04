const { Pool } = require('pg');

const checks = {
  auth: {
    sql: `SELECT password_hash AS first_value FROM users ORDER BY created_at DESC LIMIT 1`,
  },
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
  if (!check || (context !== 'auth' && !check.key)) throw new Error('Choose auth, customer or driver; data contexts require an encryption key');

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
    if (context === 'auth') {
      if (typeof first !== 'string' || !/^\$2[aby]\$12\$/.test(first)) throw new Error('Password is not a bcrypt hash with cost 12');
      console.log('auth password is stored as a bcrypt hash (cost 12); plaintext/hash was not displayed');
      return;
    }
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
