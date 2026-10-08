const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

process.env.SERVICE_CONTEXT = 'auth';
process.env.GRPC_PORT = process.env.AUTH_SERVICE_PORT || '50051';
process.env.PGHOST = process.env.PGHOST || process.env.POSTGRES_HOST || '127.0.0.1';
process.env.PGPORT = process.env.PGPORT || process.env.POSTGRES_PORT || '5432';
process.env.PGUSER = process.env.PGUSER || process.env.POSTGRES_USER || '';
process.env.PGPASSWORD = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '';
process.env.PGDATABASE = 'cab_auth';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
process.env.KAFKA_BROKERS = process.env.KAFKA_BROKERS || '127.0.0.1:9092';
process.env.CUSTOMER_SERVICE_ADDRESS = process.env.CUSTOMER_SERVICE_ADDRESS || '127.0.0.1:50052';

require('../../services/domain-service');
