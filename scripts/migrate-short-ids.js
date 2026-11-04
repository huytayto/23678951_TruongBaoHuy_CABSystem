const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const { waitForNotificationGroup } = require('./reset-demo');
const root = path.resolve(__dirname,'..');
const contexts = ['auth','customer','driver','booking','trip','payment','notification'];
const applications = ['api-gateway',...contexts.map(c=>c+'-service')];
const config = dotenv.parse(fs.readFileSync(path.join(root,'.env')));
const env = {...process.env,...config,SEED_DEMO_PASSWORD:config.SEED_DEMO_PASSWORD || ''};

function compose(args,input,capture=false) {
  const r=spawnSync('docker',['compose',...args],{cwd:root,env,input,encoding:'utf8',maxBuffer:10*1024*1024,
    stdio:[input===undefined?'ignore':'pipe',capture?'pipe':'inherit',capture?'pipe':'inherit']});
  if(r.error)throw r.error;
  if(r.status!==0){if(capture)console.error(r.stderr);throw Error('docker compose '+args.slice(0,3).join(' ')+' failed');}
  return (r.stdout || '')+(capture?r.stderr || '':'');
}

function worker(execute) {
  return compose(['run','--rm','--no-deps','-T','api-gateway','node'],
    `require('/app/services/id-migration').migrate(${execute}).catch(e=>{console.error(e.message);process.exitCode=1;});`);
}

async function rebuildTransientState() {
  const {Pool}=require('pg');
  const Redis=require('ioredis');
  const redis=new Redis(process.env.REDIS_URL);
  const connect=db=>new Pool({host:process.env.PGHOST,user:process.env.PGUSER,password:process.env.PGPASSWORD,database:db});
  const driver=connect('cab_driver'), booking=connect('cab_booking');
  try {
    let cursor='0';
    do {const [next,keys]=await redis.scan(cursor,'MATCH','cab:*','COUNT',200);cursor=next;const stale=keys.filter(k=>!k.startsWith('cab:revoked:'));if(stale.length)await redis.del(...stale);}while(cursor!=='0');
    const rows=(await driver.query("SELECT uid,latitude,longitude FROM drivers WHERE approval_status='ACTIVE' AND availability='AVAILABLE' AND latitude IS NOT NULL AND longitude IS NOT NULL")).rows;
    for(const d of rows)await redis.geoadd('cab:drivers:available',d.longitude,d.latitude,d.uid);
    const pending=(await booking.query("SELECT booking_id,offered_driver_uid,offered_at FROM bookings WHERE status='SEARCHING_DRIVER' AND offered_driver_uid IS NOT NULL")).rows;
    const ttl=process.env.SMOKE_MODE==='true'?600:15;
    for(const b of pending){const remaining=Math.ceil(ttl-(Date.now()-new Date(b.offered_at).getTime())/1000);if(remaining>0)await redis.set('cab:booking:offer-exp:'+b.booking_id,b.offered_driver_uid,'EX',remaining);}
    console.log('Rebuilt Redis Geo/offers with real short IDs; log in again after migration.');
  } finally {await driver.end();await booking.end();await redis.quit();}
}

async function main() {
  if(config.SEED_DEMO_PASSWORD)throw Error('Disable legacy SEED_DEMO_PASSWORD first');
  if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Usage: npm run demo:migrate-ids [-- --check]');
  worker(false);
  if(process.argv.includes('--check'))return;
  const folder=path.join(root,'postman','reports','short-ids-'+new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(folder,{recursive:true});console.log('Backup directory:',folder);
  let stopped=false, backedUp=false, migrated=false;
  try {
    stopped=true;compose(['stop',...applications]);
    for(const context of contexts){
      compose(['exec','-T','postgres','sh','-c',`pg_dump -U "$POSTGRES_USER" -d cab_${context} -Fc -f /tmp/short-ids-${context}.dump`]);
      const file=path.join(folder,context+'.dump');compose(['cp',`postgres:/tmp/short-ids-${context}.dump`,file]);
      if(!fs.statSync(file).size)throw Error('Empty database backup');
    }
    compose(['exec','-T','redis','redis-cli','SAVE']);compose(['cp','redis:/data/dump.rdb',path.join(folder,'redis.rdb')]);
    backedUp=true;
    worker(true);migrated=true;
    compose(['run','--rm','--no-deps','-T','api-gateway','node'],`(${waitForNotificationGroup.toString()})().catch(e=>{console.error(e.message);process.exitCode=1;});`);
    const kafkaCli=['/opt/kafka/bin/kafka-consumer-groups.sh','--bootstrap-server','kafka:9092','--group','cab-notification-service'];
    const oldOffsets=compose(['exec','-T','kafka',...kafkaCli,'--describe'],undefined,true);
    fs.writeFileSync(path.join(folder,'notification-offsets.txt'),oldOffsets);
    const reset=compose(['exec','-T','kafka',...kafkaCli,'--reset-offsets','--all-topics','--to-latest','--execute'],undefined,true);
    if(/Error:|Exception/.test(reset))throw Error('Could not advance Kafka offsets');
    compose(['run','--rm','--no-deps','-T','api-gateway','node'],`(${rebuildTransientState.toString()})().catch(e=>{console.error(e.message);process.exitCode=1;});`);
  } catch(error) {
    if(backedUp && !migrated){
      console.error('Restoring original database snapshots after migration failure.');
      for(const context of contexts)compose(['exec','-T','postgres','sh','-c',`pg_restore -U "$POSTGRES_USER" --clean --if-exists -d cab_${context} /tmp/short-ids-${context}.dump`]);
    }
    throw error;
  } finally {
    if(stopped){
      if(migrated){
        compose(['up','-d','--no-deps','--wait','--wait-timeout','90',...contexts.map(c=>c+'-service')]);
        compose(['up','-d','--no-deps','--wait','--wait-timeout','90','api-gateway']);
      }else compose(['start',...applications]);
    }
  }
  console.log('Migration complete: c/d/b/t/p/r/a primary IDs, no code columns. Existing records retained. Log in again.');
}

if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
