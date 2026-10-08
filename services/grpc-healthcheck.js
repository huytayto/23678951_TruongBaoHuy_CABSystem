const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const port = Number(process.env.GRPC_PORT);
const definition = protoLoader.loadSync(path.resolve(__dirname, '../shared/proto/cab-domain.proto'), {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const loaded = grpc.loadPackageDefinition(definition);
const client = new loaded.cab.domain.DomainService(
  `127.0.0.1:${port}`,
  grpc.credentials.createInsecure(),
);

client.Invoke(
  { action: 'health', payload_json: '{}' },
  { deadline: Date.now() + 2000 },
  (error, response) => {
    client.close();
    if (error) process.exit(1);
    try {
      const result = JSON.parse(response.body_json);
      process.exit(result.status === 200 && result.body.status === 'UP' ? 0 : 1);
    } catch {
      process.exit(1);
    }
  },
);
