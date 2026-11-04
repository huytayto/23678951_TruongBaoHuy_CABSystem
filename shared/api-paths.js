// Rewrite aliases internally so methods, bodies, queries and security handlers are shared.
const boundary = '(?=/|\\?|$)';
const aliases = [
  [new RegExp('^/api/services' + boundary), '/health/services'],
  [new RegExp('^/api/health' + boundary), '/health'],
  [new RegExp('^/api/ready' + boundary), '/ready'],
  [new RegExp('^/api/drivers/([^/?]+)/approve' + boundary), '/api/v1/admin/drivers/$1/approve'],
  [new RegExp('^/api/drivers/pending' + boundary), '/api/v1/admin/drivers'],
  [new RegExp('^/api/payments/([^/?]+)/callback' + boundary), '/api/v1/demo/payments/$1/callback'],
  [new RegExp('^/api/(register|login|logout|otp)' + boundary), '/api/v1/auth/$1'],
  [new RegExp('^/api/(customers|drivers|bookings|trips|payments|notifications)' + boundary), '/api/v1/$1'],
];

function canonicalApiUrl(url) {
  for (const [pattern, replacement] of aliases) {
    if (pattern.test(url)) return url.replace(pattern, replacement);
  }
  return url;
}

module.exports = { canonicalApiUrl };
