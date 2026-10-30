# CAB Platform

For manually typed Postman requests, use [postman/MANUAL.md](postman/MANUAL.md). Short URLs such as `/auth/login`, `/drivers/D1`, `/bookings/B1/accept`, and `/trips/T1/status` use the same authenticated handlers as `/api/v1/...`. Stable readable codes are assigned by PostgreSQL sequences; UUIDs remain the internal identifiers. Start `docker compose -f docker-compose.yml -f postman/docker-compose.manual.yml up --build -d`, then `npm run manual:prepare` to prepare five drivers, sample bookings and a local Postman environment with tokens. Manual mode provides a five-minute offer window, an own-driver simulated OTP inbox and an ADMIN-only signed payment callback simulator; no extra backend service is needed.

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

## Optional nearby-driver demo accounts

To seed five nearby approved drivers for geo-search and sequential dispatch, set `SEED_DEMO_PASSWORD` in `.env` to a strong password of at least 12 characters, then recreate the auth and driver services:

```powershell
docker compose up -d --force-recreate auth-service driver-service
```

The demo usernames are `demo-driver-1` through `demo-driver-5`. This seed option is intended only for local demos; do not enable it in a deployed environment. Each demo driver is already approved and online near the example Ho Chi Minh City pickup coordinates in the OpenAPI document.

## API and authorization

The complete public REST contract is [API-Specifications/cab-openapi-spec.yaml](./API-Specifications/cab-openapi-spec.yaml). The individual context specifications remain in the same folder.

| Role | Allowed operations |
| --- | --- |
| `CUSTOMER` | Read own profile; create/list/cancel own bookings; read assigned trip and driver details; rate own completed trips; initiate online payment |
| `DRIVER` | Submit/read own driver profile; update own availability; accept offers addressed to that driver; advance assigned trips; confirm cash for own completed trips |
| `ADMIN` | Search/read driver profiles; approve/reject drivers; manage customer profiles; read notification event logs |

Register only `CUSTOMER` or `DRIVER` accounts through the public API. An `ADMIN` account is provisioned by the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables. Customer registration creates its profile through the Customer Service; a driver must register a profile and be approved before going online.

Password requirements: 8-128 characters with uppercase, lowercase, numeric, and special characters. Passwords are bcrypt-hashed; customer name/address and driver license/plate data are encrypted with AES-256-GCM using separate environment-injected keys. Access tokens are HS256 JWTs valid for one hour. Logout revokes the token until expiration using Redis. String values in JSON responses are HTML-escaped.

For local at-rest verification, create at least one customer and driver profile, then run:

```powershell
docker compose exec -T customer-service node services/verify-encryption.js customer
docker compose exec -T driver-service node services/verify-encryption.js driver
```

The Compose environment variables are suitable only for local demonstration. Production deployments should inject keys through a secret manager/KMS and plan key rotation with a data re-encryption migration.

Driver offers are sent one at a time in nearest-first order. Each offer expires after 15 seconds by default (`OFFER_TTL_SECONDS`, 300 in the manual grading override); Redis locks prevent two drivers from accepting one booking or a driver from being assigned to concurrent bookings. Trip transitions must occur in order: `DRIVER_ASSIGNED` -> `EN_ROUTE` -> `ARRIVED` -> `PICKED_UP` -> `IN_PROGRESS` -> `COMPLETED`.
Customers cannot call driver-search/profile endpoints directly; booking matching is performed service-to-service. Assigned driver details are included in the customer-authorized trip detail response.

Online payment initiation requires an `Idempotency-Key`. Replaying the same authenticated customer/trip request with that key returns the exact original response snapshot, even if the payment later settles; a unique database constraint prevents creation of a second payment transaction. The amount is taken from the completed trip, not trusted from client input. Payment creation records a `PENDING` attempt; it does not contact a real payment provider. The local webhook verifies HMAC-SHA256 over `order_id:status` using `PAYMENT_WEBHOOK_SECRET`. This callback flow is a development integration point, not a substitute for a payment provider's production signature and settlement protocol.

## Smoke testing

The complete Postman suite for all 30 items in `PHIEU_CHAM_PROJECT.pdf` is documented in [postman/README.md](postman/README.md), with a criterion-by-criterion map in [postman/RUBRIC.md](postman/RUBRIC.md). Start local grading mode with `docker compose -f docker-compose.yml -f postman/docker-compose.rubric.yml up --build -d`, then run `npm run test:postman`, or `npm run postman:prepare` to generate a ready-to-import local environment and keep the evidence helper open while using Postman. The suite checks actual database encryption and duplicate-payment counts through that loopback-only helper. OTP delivery uses local simulated inboxes for the owning driver and ADMIN; a production SMS adapter is not implemented.

With the Compose stack ready in local grading mode and `.env` containing admin credentials:

```powershell
npm ci
npm run smoke
```

The smoke test covers health/readiness, customer and driver registration, login, RBAC, nearby search, booking acceptance, ordered trip transitions, rating, payment idempotency/webhook, SQL-injection-shaped credentials, JWT tampering, and logout revocation. It requires a running stack and writes test records to its databases.
