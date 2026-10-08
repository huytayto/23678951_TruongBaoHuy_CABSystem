const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const specificationDirectory = path.resolve(__dirname, '../API-Specifications');

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
    '/health': ['get'],
    '/ready': ['get'],
    '/health/services': ['get'],
    '/api/v1/auth/register': ['post'],
    '/api/v1/auth/login': ['post'],
    '/api/v1/auth/logout': ['post'],
    '/api/v1/customers/me': ['get'],
    '/api/v1/customers': ['get', 'post'],
    '/api/v1/customers/{id}': ['get', 'put', 'delete'],
    '/api/v1/drivers/register': ['post'],
    '/api/v1/admin/drivers/{id}/approve': ['patch'],
    '/api/v1/drivers/availability': ['patch'],
    '/api/v1/drivers/nearby': ['get'],
    '/api/v1/drivers/{id}': ['get'],
    '/api/v1/bookings': ['get', 'post'],
    '/api/v1/bookings/{id}/accept': ['post'],
    '/api/v1/bookings/{id}/cancel': ['post'],
    '/api/v1/trips/{id}/status': ['patch'],
    '/api/v1/trips/{id}': ['get'],
    '/api/v1/trips/{id}/cancel': ['post'],
    '/api/v1/trips/{id}/rating': ['post'],
    '/api/v1/payments/online': ['post'],
    '/api/v1/payments/cash-confirm': ['post'],
    '/api/v1/payments/webhook': ['post'],
    '/api/v1/notifications/logs': ['get'],
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
