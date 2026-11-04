# CAB Platform

**Demo chấm 20 phút bằng API nghiệp vụ:** [postman/smoke-20p/README.md](postman/smoke-20p/README.md). Đặt `SMOKE_MODE=true` trong `.env`, chạy `docker compose up --build -d`, import hai file JSON rồi Send từ trên xuống. Có 23 request chính dùng URL nghiệp vụ `/api/...`; script phụ cũng gọi Gateway, không có route điều phối `/smoke/...`. Environment chỉ có `base_url`. Seed tự nạp khi Gateway khởi động; OTP/provider mock chỉ dùng local. Mục 24 chạy `npm run demo:at-rest` để chứng minh DB mã hóa; GET profile không phải bằng chứng at rest. Mục 29 vẫn POST bookings với header demo được điền sẵn, ngưỡng riêng 20/10s; không xác nhận tải 1000 req/s.

The current grading workflow is [postman/smoke-20p/README.md](postman/smoke-20p/README.md). Legacy manual/Postman artifacts are retained for reference; their preparation scripts and evidence helper have been removed. Short authenticated API aliases remain available.

An eight-process CAB ride platform prototype: one REST API Gateway and seven independently deployed DDD bounded-context services. Public REST traffic is exposed only by the gateway. The gateway and synchronous service-to-service calls use gRPC; domain events use Kafka.

## Services and infrastructure

| Process/container | Bounded context | Persistence / responsibilities |
| --- | --- | --- |
| `api-gateway` | API Gateway | REST, JWT authentication, RBAC, rate limiting, health checks |
| `auth-service` | Identity & Access | `cab_auth` PostgreSQL database; bcrypt password hashes and JWT issuance |
| `customer-service` | Customer Profile | `cab_customer` PostgreSQL database |
| `driver-service` | Driver & Fleet | `cab_driver` PostgreSQL database and Redis Geo availability |
| `booking-service` | Booking & Matching | `cab_booking` PostgreSQL database and Redis distributed locks / timed offers |
| `trip-service` | Ride & Trip | `cab_trip` PostgreSQL database; ordered trip states and ratings |
| `payment-service` | Payment & Settlement | `cab_payment` PostgreSQL database; webhook signatures and idempotency |
| `notification-service` | Notifications | `cab_notification` PostgreSQL database; consumes Kafka events |

PostgreSQL runs as one container with a separate database per service. Redis stores the shared rate-limit counters, driver geo indexes, expiring driver offers, distributed acceptance locks, and revoked-token markers. Kafka carries booking, driver, trip, and payment events. Internal service ports are not published to the host.

The seven gRPC services use the shared transport contract at [shared/proto/cab-domain.proto](./shared/proto/cab-domain.proto); each runs as a separate process with a distinct context, port, database, and configuration.
Compose healthchecks probe each gRPC service and the gateway; the gateway starts only after all domain services report healthy. Containers use the `unless-stopped` restart policy, so Docker restarts them after an engine/host restart unless the stack was explicitly stopped with `docker compose stop` or `docker compose down`.

## Run locally with Docker Compose

1. Copy `.env.example` to `.env`.
2. Replace the PostgreSQL password, JWT secret, webhook secret, both data-encryption keys, admin password, and username with local values. Use independent random secrets of at least 32 characters for `JWT_SECRET` and `PAYMENT_WEBHOOK_SECRET`. Generate a separate 32-byte hex key for each data context with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Do not commit `.env`.
3. From the repository root, run:

   ```powershell
   docker compose up --build -d
   docker compose ps
   ```

4. Wait for the gateway's Compose healthcheck to become healthy (`docker compose ps`), then verify readiness:

   ```powershell
   Invoke-RestMethod http://localhost:8080/ready
   Invoke-RestMethod http://localhost:8080/health/services
   ```

   The gateway is available at `http://localhost:8080`. Use `docker compose logs -f api-gateway auth-service customer-service driver-service booking-service trip-service payment-service notification-service` to inspect startup and runtime errors.

5. Stop the processes while preserving database volumes:

   ```powershell
   docker compose down
   ```

   `docker compose down -v` also permanently removes the local database and broker data.

The database initialization scripts only run when PostgreSQL's data volume is first created. To reset a local development installation, stop the stack and explicitly remove its volumes.

## Smoke data and primary IDs

Use SMOKE_MODE=true and keep SEED_DEMO_PASSWORD empty. Smoke accounts: ad, kh0, tx1 through tx5. Their primary IDs are a1, c1, d1 through d5. Customer/driver IDs are allocated by Auth and reused by profiles; booking/trip/payment IDs are b1/t1/p1. There is no code column or UUID entity alias. For an existing UUID database, build the images then run `npm run demo:migrate-ids`; backups are automatic and records are retained. Log in again after migration. `npm run demo:reset` is a separate operation that deliberately clears non-smoke records.

## API and authorization

The complete public REST contract is [API-Specifications/cab-openapi-spec.yaml](./API-Specifications/cab-openapi-spec.yaml). The individual context specifications remain in the same folder.

| Role | Allowed operations |
| --- | --- |
| `CUSTOMER` | Read own profile; create/list/cancel own bookings; read assigned trip and driver details; rate own completed trips; initiate online payment |
| `DRIVER` | Submit/read own driver profile; update own availability; accept offers addressed to that driver; advance assigned trips; confirm cash for own completed trips |
| `ADMIN` | Search/read driver profiles; approve/reject drivers; manage customer profiles; read notification event logs |

Register only `CUSTOMER` or `DRIVER` accounts through the public API. An `ADMIN` account is provisioned by the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables. Customer registration creates its profile through the Customer Service; a driver must register a profile and be approved before going online.

Passwords must be supplied as strings, with no length or character requirements; empty strings are accepted. Passwords are bcrypt-hashed; customer name/address and driver license/plate data are encrypted with AES-256-GCM using separate environment-injected keys. Access tokens are HS256 JWTs valid for one hour. Logout revokes the token until expiration using Redis. String values in JSON responses are HTML-escaped.

For local at-rest verification, create at least one customer and driver profile, then run:

```powershell
docker compose exec -T customer-service node services/verify-encryption.js customer
docker compose exec -T driver-service node services/verify-encryption.js driver
```

The Compose environment variables are suitable only for local demonstration. Production deployments should inject keys through a secret manager/KMS and plan key rotation with a data re-encryption migration.

Driver offers are sent one at a time in nearest-first order. Each offer expires after 15 seconds by default (`OFFER_TTL_SECONDS`, 300 in the manual grading override); Redis locks prevent two drivers from accepting one booking or a driver from being assigned to concurrent bookings. Trip transitions must occur in order: `DRIVER_ASSIGNED` -> `IN_PROGRESS` -> `COMPLETED`.
Customers cannot call driver-search/profile endpoints directly; booking matching is performed service-to-service. Assigned driver details are included in the customer-authorized trip detail response.

Online payment initiation requires an `Idempotency-Key`. Replaying the same authenticated customer/trip request with that key returns the exact original response snapshot, even if the payment later settles; a unique database constraint prevents creation of a second payment transaction. The amount is taken from the completed trip, not trusted from client input. Payment creation records a `PENDING` attempt; it does not contact a real payment provider. The local webhook verifies HMAC-SHA256 over `order_id:status` using `PAYMENT_WEBHOOK_SECRET`. This callback flow is a development integration point, not a substitute for a payment provider's production signature and settlement protocol.

## Smoke testing

Use [postman/smoke-20p/README.md](postman/smoke-20p/README.md) for the current 23-request grading collection. Run `npm run demo:build` after editing its generator, `npm run demo:check` to verify the flow against a running stack, and `npm run demo:at-rest` for database encryption evidence. The legacy Postman runner and evidence helper have been removed.

With the Compose stack ready in local grading mode and `.env` containing admin credentials:

```powershell
npm ci
npm run smoke
```

The smoke test covers health/readiness, customer and driver registration, login, RBAC, nearby search, booking acceptance, ordered trip transitions, rating, payment idempotency/webhook, SQL-injection-shaped credentials, JWT tampering, and logout revocation. It requires a running stack and writes test records to its databases.
