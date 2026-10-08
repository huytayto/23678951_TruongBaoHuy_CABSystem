const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

process.env.SERVICE_CONTEXT = 'customer';
process.env.GRPC_PORT = process.env.CUSTOMER_SERVICE_PORT || '50052';
process.env.PGHOST = process.env.PGHOST || process.env.POSTGRES_HOST || '127.0.0.1';
process.env.PGPORT = process.env.PGPORT || process.env.POSTGRES_PORT || '5432';
process.env.PGUSER = process.env.PGUSER || process.env.POSTGRES_USER || '';
process.env.PGPASSWORD = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '';
process.env.PGDATABASE = 'cab_customer';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
process.env.KAFKA_BROKERS = process.env.KAFKA_BROKERS || '127.0.0.1:9092';

require('../../services/domain-service');
