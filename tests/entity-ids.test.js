const test=require('node:test');
const assert=require('node:assert/strict');
const {isEntityId}=require('../services/entity-ids');
const {buildMapping,rewriteJson}=require('../services/id-migration');

test('entity IDs are lowercase primary IDs with the expected type',()=>{
  assert.equal(isEntityId('customer','c1'),true);
  assert.equal(isEntityId('driver','d25'),true);
  for(const id of ['D1','d0','d01','c1','00000000-0020-4000-8000-000000000011'])assert.equal(isEntityId('driver',id),false);
});

test('migration uses one identity for users, profiles and business references',()=>{
  const data={users:[{uid:'old-c',role:'CUSTOMER'},{uid:'old-d',role:'DRIVER'},{uid:'old-a',role:'ADMIN'}],
    customers:[{uid:'old-c',code:'C2'}],drivers:[{uid:'old-d',code:'D6'}],
    bookings:[{booking_id:'old-b',code:'B7'}],trips:[{trip_id:'old-t',code:'T2'}],ratings:[],payments:[]};
  const map=buildMapping(data);
  assert.equal(map.customer['old-c'],'c2');assert.equal(map.driver['old-d'],'d6');
  const json=rewriteJson({payment:{trip_id:'old-t',customer_id:'old-c',code:'P1'},candidate_driver_uids:['old-d'],key:'pay1'},map);
  assert.deepEqual(json,{payment:{trip_id:'t2',customer_id:'c2'},candidate_driver_uids:['d6'],key:'pay1'});
});

test('migration preserves real short IDs and assigns distinct IDs to users without profiles',()=>{
  const data={users:[{uid:'c1',role:'CUSTOMER'},{uid:'old-c',role:'CUSTOMER'},{uid:'old-d',role:'DRIVER'}],
    customers:[{uid:'c1'}],drivers:[],bookings:[],trips:[],ratings:[],payments:[]};
  const map=buildMapping(data);assert.equal(map.customer.c1,'c1');assert.equal(map.customer['old-c'],'c2');
  assert.equal(map.driver['old-d'],'d1');assert.equal(new Set(Object.values(map.customer)).size,2);
});
