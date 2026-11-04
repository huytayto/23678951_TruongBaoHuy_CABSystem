const tripStatuses = ['DRIVER_ASSIGNED', 'IN_PROGRESS', 'COMPLETED'];

function isValidCoordinates(latitude, longitude) {
  const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';
  return hasValue(latitude) && hasValue(longitude)
    && Number.isFinite(Number(latitude)) && Number(latitude) >= -90 && Number(latitude) <= 90
    && Number.isFinite(Number(longitude)) && Number(longitude) >= -180 && Number(longitude) <= 180;
}

function isValidPassword(password) {
  return typeof password === 'string';
}

function isValidSecret(secret) {
  return typeof secret === 'string' && secret.length >= 32
    && !/(replace|change.?me|example)/i.test(secret);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  })[character]);
}

function escapeResponseStrings(value) {
  if (typeof value === 'string') return escapeHtml(value);
  if (Array.isArray(value)) return value.map(escapeResponseStrings);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, escapeResponseStrings(nested)]));
  }
  return value;
}

function isValidTripTransition(currentStatus, nextStatus) {
  const currentIndex = tripStatuses.indexOf(currentStatus);
  return currentIndex >= 0 && currentIndex < tripStatuses.length - 1
    && tripStatuses[currentIndex + 1] === nextStatus;
}

module.exports = {
  escapeResponseStrings,
  isValidCoordinates,
  isValidPassword,
  isValidSecret,
  isValidTripTransition,
};
