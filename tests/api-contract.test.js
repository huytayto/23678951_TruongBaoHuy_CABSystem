const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const specificationDirectory = path.resolve(__dirname, '../API-Specifications');
const { canonicalApiUrl } = require('../shared/api-paths');
const { normalizeInput } = require('../shared/request-input');

test('short input fields preserve types and reject conflicting canonical values', () => {
  assert.deepEqual(normalizeInput({ user: 'kh1', pass: '', from_lat: 22, from_lng: 111, to_lat: 22.01, to_lng: 111.01 }),
    { username: 'kh1', password: '', pickup_lat: 22, pickup_lng: 111, dropoff_lat: 22.01, dropoff_lng: 111.01 });
  assert.deepEqual(normalizeInput({ license: 'L6', plate: 'P6', lat: 22, lng: 111, trip: 'T1' }),
    { license_number: 'L6', plate_number: 'P6', latitude: 22, longitude: 111, trip_id: 'T1' });
  assert.throws(() => normalizeInput({ user: 'kh1', username: 'ad' }), /conflicting/);
  assert.throws(() => normalizeInput({ lat: 0, latitude: 22 }), /conflicting/);
  assert.deepEqual(normalizeInput({ pass: '', password: '' }), { password: '' });
  assert.deepEqual(normalizeInput({ username: 'kh1', password: 'customerpassword' }), { username: 'kh1', password: 'customerpassword' });
});

test('short trip statuses are scoped to trip status requests and still obey transitions', () => {
  const { isValidTripTransition } = require('../services/domain-rules');
  const states = ['start', 'done'].map(status => normalizeInput({ status }, true).status);
  assert.deepEqual(states, ['IN_PROGRESS', 'COMPLETED']);
  let current = 'DRIVER_ASSIGNED';
  for (const state of states) { assert.equal(isValidTripTransition(current, state), true); current = state; }
  assert.equal(isValidTripTransition('DRIVER_ASSIGNED', normalizeInput({ status: 'done' }, true).status), false);
  assert.deepEqual(normalizeInput({ status: 'SUCCESS' }), { status: 'SUCCESS' });
  assert.deepEqual(normalizeInput({ status: 'done' }), { status: 'done' });
});

test('short API aliases resolve auth, nested operations and queries without path collisions', () => {
  const cases = {
    '/api/register': '/api/v1/auth/register',
    '/api/login': '/api/v1/auth/login',
    '/api/logout': '/api/v1/auth/logout',
    '/api/otp/verify': '/api/v1/auth/otp/verify',
    '/api/drivers/pending?page=2': '/api/v1/admin/drivers?page=2',
    '/api/drivers/D59/approve': '/api/v1/admin/drivers/D59/approve',
    '/api/drivers/nearby?lat=22&lng=111&radius=1km': '/api/v1/drivers/nearby?lat=22&lng=111&radius=1km',
    '/api/bookings/B74/trip': '/api/v1/bookings/B74/trip',
    '/api/trips/T1/status': '/api/v1/trips/T1/status',
    '/api/payments/P1/callback': '/api/v1/demo/payments/P1/callback',
    '/api/payments/online': '/api/v1/payments/online',
    '/api/notifications/me': '/api/v1/notifications/me',
    '/api/services': '/health/services',
    '/api/health': '/health',
    '/api/ready': '/ready',
    '/api/register-extra': '/api/register-extra',
    '/api/driversXYZ': '/api/driversXYZ',
    '/api/v1/auth/login': '/api/v1/auth/login',
  };
  for (const [alias, canonical] of Object.entries(cases)) {
    assert.equal(canonicalApiUrl(alias), canonical, alias);
  }
});

test('all API specification YAML files parse as OpenAPI 3.0.3', () => {
  const files = fs.readdirSync(specificationDirectory).filter((name) => name.endsWith('.yaml'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const specification = YAML.parse(fs.readFileSync(path.join(specificationDirectory, file), 'utf8'));
    assert.equal(specification.openapi, '3.0.3', `${file} OpenAPI version`);
    assert.ok(specification.info?.title, `${file} has a title`);
    assert.ok(specification.paths, `${file} has paths`);
  }
});

test('combined JSON and YAML OpenAPI documents remain identical', () => {
  const yamlSpec = YAML.parse(fs.readFileSync(
    path.join(specificationDirectory, 'cab-openapi-spec.yaml'), 'utf8',
  ));
  const jsonSpec = JSON.parse(fs.readFileSync(
    path.join(specificationDirectory, 'cab-openapi-spec.json'), 'utf8',
  ));
  assert.deepEqual(jsonSpec, yamlSpec);
});

test('combined contract includes health and every implemented public business flow', () => {
  const specification = YAML.parse(fs.readFileSync(
    path.join(specificationDirectory, 'cab-openapi-spec.yaml'), 'utf8',
  ));
  const expectedOperations = {
    '/': ['get'],
    '/health': ['get'],
    '/ready': ['get'],
    '/health/services': ['get'],
    '/api/v1/auth/register': ['post'],
    '/api/v1/auth/login': ['post'],
    '/api/v1/auth/logout': ['post'],
    '/api/v1/auth/otp/request': ['post'],
    '/api/v1/auth/otp/verify': ['post'],
    '/api/v1/auth/otp': ['get'],
    '/api/v1/admin/test/otp/{id}': ['get'],
    '/api/v1/customers/me': ['get'],
    '/api/v1/customers': ['get', 'post'],
    '/api/v1/customers/{id}': ['get', 'put', 'delete'],
    '/api/v1/drivers/register': ['post'],
    '/api/v1/admin/drivers/{id}/approve': ['patch'],
    '/api/v1/admin/drivers': ['get'],
    '/api/v1/drivers/offers': ['get'],
    '/api/v1/drivers/me': ['get'],
    '/api/v1/drivers/availability': ['patch'],
    '/api/v1/drivers/nearby': ['get'],
    '/api/v1/drivers/{id}': ['get'],
    '/api/v1/bookings': ['get', 'post'],
    '/api/v1/bookings/{id}/accept': ['post'],
    '/api/v1/bookings/{id}/cancel': ['post'],
    '/api/v1/bookings/{id}/trip': ['get'],
    '/api/v1/bookings/{id}': ['get'],
    '/api/v1/trips/{id}/status': ['patch'],
    '/api/v1/trips/{id}/location': ['patch'],
    '/api/v1/trips/{id}': ['get'],
    '/api/v1/trips/{id}/cancel': ['post'],
    '/api/v1/trips/{id}/rating': ['post'],
    '/api/v1/payments/online': ['post'],
    '/api/v1/payments/cash-confirm': ['post'],
    '/api/v1/payments/webhook': ['post'],
    '/api/v1/payments/{id}': ['get'],
    '/api/v1/demo/payments/{id}/callback': ['post'],
    '/api/v1/notifications/logs': ['get'],
    '/api/v1/notifications/me': ['get'],
  };
  for (const [route, methods] of Object.entries(expectedOperations)) {
    for (const method of methods) {
      assert.ok(specification.paths[route]?.[method], `Missing ${method.toUpperCase()} ${route}`);
    }
  }
});

test('online payment contract requires a replay-safe key and documents response reuse', () => {
  const specification = YAML.parse(fs.readFileSync(
    path.join(specificationDirectory, 'cab-openapi-spec.yaml'), 'utf8',
  ));
  const operation = specification.paths['/api/v1/payments/online'].post;
  const idempotencyKey = operation.parameters.find((parameter) => parameter.name === 'Idempotency-Key');
  assert.equal(idempotencyKey?.in, 'header');
  assert.equal(idempotencyKey?.required, true);
  assert.match(operation.description, /exact original response snapshot/i);
  assert.match(operation.description, /second payment transaction/i);
});
