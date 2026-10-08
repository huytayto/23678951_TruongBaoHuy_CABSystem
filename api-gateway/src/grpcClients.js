const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const contexts = ['auth', 'customer', 'driver', 'booking', 'trip', 'notification', 'payment'];
const defaultPorts = {
  auth: 50051,
  customer: 50052,
  driver: 50053,
  booking: 50054,
  trip: 50055,
  notification: 50056,
  payment: 50057,
};
const protoPath = path.resolve(__dirname, '../../shared/proto/cab-domain.proto');
const definition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const loaded = grpc.loadPackageDefinition(definition);
const clients = Object.fromEntries(contexts.map((context) => {
  const address = process.env[`${context.toUpperCase()}_SERVICE_ADDRESS`] || `127.0.0.1:${defaultPorts[context]}`;
  return [context, new loaded.cab.domain.DomainService(address, grpc.credentials.createInsecure())];
}));

function invoke(context, action, payload = {}) {
  if (!clients[context]) return Promise.reject(new Error(`Unknown service context: ${context}`));
  return new Promise((resolve, reject) => {
    clients[context].Invoke(
      { action, payload_json: JSON.stringify(payload) },
      { deadline: Date.now() + 7000 },
      (error, response) => {
        if (error) return reject(error);
        try {
          const result = JSON.parse(response.body_json);
          return resolve(result);
        } catch (parseError) {
          return reject(parseError);
        }
      },
    );
  });
}

module.exports = { contexts, clients, invoke };
