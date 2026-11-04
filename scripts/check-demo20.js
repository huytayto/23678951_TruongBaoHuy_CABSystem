// Runs the exact 23 exported requests using Node built-ins. No Newman or reports.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname,'../postman/smoke-20p');
const collection = JSON.parse(fs.readFileSync(path.join(dir,'collection.json'),'utf8'));
const environment = JSON.parse(fs.readFileSync(path.join(dir,'environment.json'),'utf8'));
const vars = new Map(collection.variable.map(v=>[v.key,v.value]));
const env = new Map(environment.values.map(v=>[v.key,v.value]));
const normalize = value=>JSON.parse(JSON.stringify(value));
function expand(value) {
  return value.replace(/\{\{([^}]+)\}\}/g,(_,key)=>key==='$timestamp'?String(Date.now()):key==='$randomInt'?String(Math.floor(Math.random()*1e9)):(vars.get(key) ?? env.get(key) ?? ''));
}
async function send(request) {
  const response = await fetch(expand(typeof request.url==='string'?request.url:request.url.raw), {
    method:request.method||'GET',signal:AbortSignal.timeout(30000),
    headers:Object.fromEntries((Array.isArray(request.header)?request.header:Object.entries(request.header||{}).map(([key,value])=>({key,value}))).map(h=>[h.key,expand(h.value)])),
    ...(request.body?{body:expand(request.body.raw)}:{}),
  });
  const body = await response.json();
  return {code:response.status,json:()=>body};
}
async function main() {
  const items=collection.item.flatMap(folder=>folder.item);
  assert.equal(items.length,23); assert.deepEqual([...env.keys()],['base_url']);
  let assertions=0;
  const started=Date.now();
  for (const item of items) {
    const request=structuredClone(item.request);
    assert.ok(request.url.startsWith('{{base_url}}/'),'All requests go through Gateway');
    assert.ok(request.url.startsWith('{{base_url}}/api/'),'All requests use short /api URLs');
    assert.ok(!JSON.stringify(item).includes('/api/v1/'),'Scripts also use short URLs');
    assert.ok(!JSON.stringify(item).includes('/smoke/'),'No orchestration URLs in requests or scripts');
    const pending=[],failures=[];
    const pm={environment:{get:key=>env.get(key)},collectionVariables:{get:key=>vars.get(key),set:(key,value)=>vars.set(key,value)},
      test:(name,fn)=>{assertions++;try{fn();}catch(error){failures.push(name+': '+error.message);}},
      expect:value=>({to:{eql:expected=>assert.deepEqual(normalize(value),normalize(expected))}}),
      sendRequest:(request,callback)=>pending.push(send(request).then(r=>callback(null,r)).catch(error=>{failures.push(error.message);callback(error);}))};
    async function runEvents(kind) {
      for(const event of (item.event||[]).filter(e=>e.listen===kind)) {
        await vm.runInNewContext(event.script.exec.join('\n'),{pm,console,setTimeout},{timeout:5000});
      }
      if(failures.length)throw new Error(item.name+' — '+failures.join('; '));
    }
    await runEvents('prerequest');
    if(request.auth.type==='bearer')request.header.push({key:'Authorization',value:'Bearer '+request.auth.bearer[0].value});
    const response=await send(request); pm.response=response;
    await runEvents('test');
    await Promise.all(pending);
    if(failures.length)throw new Error(item.name+' — '+failures.join('; '));
    console.log(`PASS ${item.name} [${response.code}]`);
  }
  // Replay can be clicked a second time after the full sequence without changing anything.
  const last=structuredClone(items.at(-1).request);
  last.header.push({key:'Authorization',value:'Bearer {{token}}'});
  const repeated=await send(last);
  assert.equal(repeated.code,200);
  assert.deepEqual(repeated.json(),JSON.parse(vars.get('payment_response')));
  console.log(`PASS: 23/23 requests, ${assertions} assertions, second replay unchanged; ${((Date.now()-started)/1000).toFixed(1)} seconds execution. No report files written.`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
