const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { definitions, isEntityId, syncIdSequences } = require('./entity-ids');

const columns = {
  auth: { users: { uid: 'user' } },
  customer: { customers: { uid: 'customer' } },
  driver: { drivers: { uid: 'driver' } },
  booking: { bookings: { booking_id: 'booking', customer_id: 'customer', offered_driver_uid: 'driver', assigned_driver_uid: 'driver', candidate_driver_uids: 'driver[]' } },
  trip: { trips: { trip_id: 'trip', booking_id: 'booking', customer_id: 'customer', driver_id: 'driver', payment_id: 'payment' },
    ratings: { rating_id: 'rating', trip_id: 'trip', customer_id: 'customer' } },
  payment: { payments: { payment_id: 'payment', trip_id: 'trip', customer_id: 'customer' } },
  notification: { notification_logs: {} },
};

function buildMapping(data) {
  const mapping = {}, used = {};
  for (const kind of Object.keys(definitions)) { mapping[kind] = {}; used[kind] = new Set(); }
  function assign(kind, old, preferred) {
    if (mapping[kind][old]) return;
    let id = preferred;
    if (!isEntityId(kind, id) || used[kind].has(id)) {
      let n = 1;
      while (used[kind].has(definitions[kind].prefix+n)) n++;
      id = definitions[kind].prefix+n;
    }
    mapping[kind][old] = id; used[kind].add(id);
  }
  const roles = { CUSTOMER: 'customer', DRIVER: 'driver', ADMIN: 'admin' };
  // Keep existing short IDs, then reserve the identities of the dedicated smoke fixtures.
  for (const u of data.users) if (isEntityId(roles[u.role], u.uid)) assign(roles[u.role],u.uid,u.uid);
  const legacy = n => `00000000-0020-4000-8000-${String(n).padStart(12,'0')}`;
  for (const [kind,old,id] of [['admin',legacy(1),'a1'],['customer',legacy(2),'c1'],
    ...Array.from({length:5},(_,i)=>['driver',legacy(11+i),'d'+(i+1)])]) {
    if (data.users.some(u=>u.uid===old)) assign(kind,old,id);
  }
  for (const [kind, table, field] of [['customer','customers','uid'],['driver','drivers','uid'],
    ['booking','bookings','booking_id'],['trip','trips','trip_id'],['rating','ratings','rating_id'],['payment','payments','payment_id']]) {
    for (const row of data[table]) assign(kind,row[field],isEntityId(kind,row[field]) ? row[field] : String(row.code || '').toLowerCase());
  }
  for (const u of data.users) assign(roles[u.role],u.uid);
  return mapping;
}

function rewriteJson(value, mapping) {
  if (typeof value === 'string') {
    for (const group of Object.values(mapping)) if (Object.hasOwn(group,value)) return group[value];
    return value;
  }
  if (Array.isArray(value)) return value.map(v=>rewriteJson(v,mapping));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key])=>key!=='code').map(([key,v])=>[key,rewriteJson(v,mapping)]));
  return value;
}

async function migrate(execute = false) {
  const pools = {}, clients = {}, data = {}, counts = {}, constraints = {};
  let alreadyMigrated = true;
  try {
    for (const [context,tables] of Object.entries(columns)) {
      pools[context] = new Pool({host:process.env.PGHOST,port:process.env.PGPORT || 5432,
        user:process.env.PGUSER,password:process.env.PGPASSWORD,database:'cab_'+context});
      clients[context] = await pools[context].connect();
      await clients[context].query('BEGIN');
      const legacyColumns=Number((await clients[context].query(`SELECT count(*) FROM information_schema.columns
        WHERE table_schema='public' AND (column_name='code' OR udt_name IN ('uuid','_uuid'))`)).rows[0].count);
      if(legacyColumns)alreadyMigrated=false;
      for (const table of Object.keys(tables)) {
        // Stable ordering keeps migration deterministic, including rows without legacy codes.
        const order = table === 'notification_logs' ? 'notification_id' : 'created_at';
        data[table] = (await clients[context].query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows;
        counts[table] = data[table].length;
      }
    }
    const mapping = buildMapping(data);
    const roles = {CUSTOMER:'customer',DRIVER:'driver',ADMIN:'admin'};
    const mapped = (kind,id) => {
      if (id === null || id === undefined) return id;
      assert.ok(mapping[kind]?.[id], `Unmapped ${kind} reference: ${id}`);
      return mapping[kind][id];
    };
    const planned = {};
    for (const [context,tables] of Object.entries(columns)) for (const [table,fields] of Object.entries(tables)) {
      planned[table] = data[table].map(row=>Object.fromEntries(Object.entries(fields).map(([field,kind])=>
        [field,kind.endsWith('[]') ? row[field].map(id=>mapped(kind.slice(0,-2),id)) : mapped(kind==='user'?roles[row.role]:kind,row[field])])));
    }
    if (!execute || alreadyMigrated) {
      console.log(JSON.stringify({records:counts,alreadyMigrated,plan:alreadyMigrated?'Primary IDs already migrated; no database changes':'TEXT primary/foreign keys; remove code; preserve records and relationships'}));
      return;
    }
    for (const [context,tables] of Object.entries(columns)) {
      const client = clients[context];
      constraints[context] = (await client.query(`SELECT conrelid::regclass::text AS tablename,conname,pg_get_constraintdef(oid) AS definition
        FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace`)).rows;
      for (const c of constraints[context]) await client.query(`ALTER TABLE ${c.tablename} DROP CONSTRAINT "${c.conname}"`);
      for (const [table,fields] of Object.entries(tables)) {
        for (const [field,kind] of Object.entries(fields)) {
          if (kind.endsWith('[]')) await client.query(`ALTER TABLE ${table} ALTER COLUMN ${field} DROP DEFAULT`);
          await client.query(`ALTER TABLE ${table} ALTER COLUMN ${field} TYPE ${kind.endsWith('[]')?'TEXT[]':'TEXT'} USING ${field}::${kind.endsWith('[]')?'TEXT[]':'TEXT'}`);
          if (kind.endsWith('[]')) await client.query(`ALTER TABLE ${table} ALTER COLUMN ${field} SET DEFAULT '{}'::text[]`);
        }
        const idField = Object.keys(fields)[0];
        for (const [i,row] of data[table].entries()) {
          const changes = {...planned[table][i]};
          if (table==='payments' && row.idempotency_response) changes.idempotency_response=JSON.stringify(rewriteJson(row.idempotency_response,mapping));
          if (table==='notification_logs') changes.payload=JSON.stringify(rewriteJson(row.payload,mapping));
          const keys=Object.keys(changes);
          if (keys.length) await client.query(`UPDATE ${table} SET ${keys.map((k,j)=>`${k}=$${j+1}`).join(',')}
            WHERE ${idField || 'notification_id'}=$${keys.length+1}`, [...Object.values(changes),row[idField || 'notification_id']]);
        }
        await client.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS code`);
        await client.query(`DROP SEQUENCE IF EXISTS ${table}_code_seq`);
        assert.equal(Number((await client.query(`SELECT count(*) FROM ${table}`)).rows[0].count),counts[table]);
      }
      for (const c of constraints[context]) await client.query(`ALTER TABLE ${c.tablename} ADD CONSTRAINT "${c.conname}" ${c.definition}`);
      await syncIdSequences(client,context,process.env.SMOKE_MODE==='true');
    }
    for (const client of Object.values(clients)) await client.query('COMMIT');
    console.log(JSON.stringify({migrated:counts,ids:Object.fromEntries(Object.entries(mapping).map(([kind,values])=>[kind,Object.keys(values).length]))}));
  } finally {
    for (const client of Object.values(clients)) { await client.query('ROLLBACK').catch(()=>{}); client.release(); }
    for (const pool of Object.values(pools)) await pool.end();
  }
}

module.exports = { buildMapping, rewriteJson, migrate };
