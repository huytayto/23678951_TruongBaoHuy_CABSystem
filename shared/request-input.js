const fields = {
  user: 'username', pass: 'password', license: 'license_number', plate: 'plate_number',
  lat: 'latitude', lng: 'longitude', from_lat: 'pickup_lat', from_lng: 'pickup_lng',
  to_lat: 'dropoff_lat', to_lng: 'dropoff_lng', trip: 'trip_id',
};
const tripStatuses = {
  start: 'IN_PROGRESS', done: 'COMPLETED',
};

function normalizeInput(body, tripStatus = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const normalized = { ...body };
  for (const [alias, canonical] of Object.entries(fields)) {
    if (!Object.hasOwn(body, alias)) continue;
    if (Object.hasOwn(body, canonical) && body[canonical] !== body[alias]) {
      throw new Error(`Use either ${alias} or ${canonical}; conflicting values are not accepted`);
    }
    normalized[canonical] = body[alias];
    delete normalized[alias];
  }
  if (tripStatus && Object.hasOwn(tripStatuses, normalized.status)) {
    normalized.status = tripStatuses[normalized.status];
  }
  return normalized;
}

module.exports = { normalizeInput, fields, tripStatuses };
