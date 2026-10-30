const fs = require('node:fs');
const path = require('node:path');
const newman = require('newman');
const { prepareEnvironment, startEvidenceServer } = require('./postman-support');
const root = path.resolve(__dirname, '..');

async function main() {
  const { environment, token } = prepareEnvironment();
  const server = await startEvidenceServer(token);
  const reportDirectory = path.join(root, 'postman/reports');
  fs.mkdirSync(reportDirectory, { recursive: true });
  try {
    const summary = await new Promise((resolve, reject) => newman.run({
      collection: path.join(root, 'postman/CAB-30-Criteria.postman_collection.json'), environment,
      reporters: ['cli'], reporter: { cli: { noConsole: true } },
      timeoutRequest: 60000, timeoutScript: 180000, timeout: 900000,
    }, (error, result) => error ? reject(error) : resolve(result)));
    // Sanitized reports: do not persist raw Newman execution objects or environments with credentials.
    const report = {
      executed_at: new Date().toISOString(), stats: summary.run.stats,
      failures: summary.run.failures.map(f => ({ source: f.source?.name || '', test: f.error?.test || '', message: f.error?.message || '' })),
      requests: summary.run.executions.map(e => ({ name: e.item.name, status: e.response?.code,
        tests: (e.assertions || []).map(a => ({ name: a.assertion, passed: !a.error })) })),
      grading_note: 'API assertions and supporting evidence are not an automatic instructor grade. See postman/RUBRIC.md for manual criteria 1–5,7,8 and local OTP/payment simulation limits.',
    };
    fs.writeFileSync(path.join(reportDirectory, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
    const env = summary.environment.toJSON();
    const get = key => env.values.find(v => v.key === key)?.value;
    report.run_id = get('run_id');
    report.rate_limit = JSON.parse(get('rate_limit_result') || 'null');
    fs.writeFileSync(path.join(reportDirectory, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`Sanitized report: postman/reports/latest.json; requests=${report.stats.requests.total}; assertions=${report.stats.assertions.total}; failed=${report.stats.assertions.failed}`);
    if (report.rate_limit) console.log('Rate limit:', JSON.stringify(report.rate_limit));
    if (summary.run.failures.length) process.exitCode = 1;
  } finally { await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error('Postman run failed:', error.message); process.exitCode = 1; });
