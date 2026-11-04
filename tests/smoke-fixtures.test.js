const test = require('node:test');
const assert = require('node:assert/strict');
const smoke = require('../services/smoke-fixtures');
const { definitions } = require('../services/entity-ids');

function distanceMeters(driver) {
  const rad = degrees => degrees * Math.PI / 180;
  const a = Math.sin(rad(driver.latitude - smoke.latitude) / 2) ** 2
    + Math.cos(rad(smoke.latitude)) * Math.cos(rad(driver.latitude))
    * Math.sin(rad(driver.longitude - smoke.longitude) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

test('smoke seeds five customers and ten drivers without reserving demo registration identities', () => {
  assert.equal(smoke.customers.length, 5);
  assert.equal(smoke.drivers.length, 10);
  assert.deepEqual(smoke.customer, smoke.customers[0]);
  const users = [smoke.admin, ...smoke.customers, ...smoke.drivers];
  assert.equal(new Set(users.map(user => user.uid)).size, 16);
  assert.equal(new Set(users.map(user => user.username)).size, 16);
  assert.ok(!users.some(user => ['kh5', 'tx11'].includes(user.username)));
  assert.equal(definitions.customer.reserve, 5);
  assert.equal(definitions.driver.reserve, 10);
});

test('exactly the original five drivers have distinct positions within one kilometer of (22,111)', () => {
  assert.equal(smoke.latitude, 22);
  assert.equal(smoke.longitude, 111);
  const nearby = smoke.drivers.filter(driver => distanceMeters(driver) <= 1000);
  assert.deepEqual(nearby.map(driver => driver.uid), ['d1', 'd2', 'd3', 'd4', 'd5']);
  assert.equal(new Set(nearby.map(driver => driver.latitude)).size, 5);
  assert.equal(new Set(nearby.map(driver => driver.longitude)).size, 5);
  assert.deepEqual(smoke.drivers.filter(driver => driver.approval === 'ACTIVE'
    && driver.availability === 'AVAILABLE').map(driver => driver.uid), ['d1', 'd2']);
});
