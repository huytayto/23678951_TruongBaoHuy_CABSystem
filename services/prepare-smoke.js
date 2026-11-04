// Fixture preparation only; it is not a public HTTP demo workflow.
async function prepare(invoke, reset = true) {
  for (const context of ['auth', 'customer', 'trip', 'booking', 'driver']) {
    const result = await invoke(context, 'smoke_seed', { reset });
    if (result.status !== 200) throw new Error(`Cannot prepare ${context} fixtures: ${result.body.message}`);
  }
}
module.exports = { prepare };
if (require.main === module) {
  require('./prepare-smoke').prepare(require('../api-gateway/src/grpcClients').invoke)
    .then(() => { console.log('Dedicated demo fixtures ready'); process.exit(0); })
    .catch(error => { console.error(error.message); process.exit(1); });
}
