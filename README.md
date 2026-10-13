# Haven — Hostel management system

A simple MERN project for managing a hostel’s rooms, residents, and monthly rent. Built with MongoDB, Express, React, and Node.js.

## Features

- Overview with live resident totals, occupancy, available beds, and rent collections
- Separate Boys Hostel and Girls Hostel blocks, with a hostel filter for overview, residents, rooms, and payments
- Resident registration with gender, matching hostel assignment, search, rent status filters, and details
- Room creation with floor, bed capacity, monthly rent, and availability
- Monthly payment recording, searchable payment history, and pending rent totals
- Server validation, duplicate email/payment prevention, and concurrent-safe bed assignment
- Student and warden logins with hashed passwords, database-backed sessions, and role permissions
- Student portal with personal room details and rent history
- Student maintenance requests with Open / In progress / Resolved status updates
- Warden-controlled student password setup and reset
- Responsive interface, keyboard-accessible dialogs, and synthetic demo data

## Run locally

Requires Node.js 22 or later and npm. Node.js 24 was used for verification.

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. Express runs on port 3001. The first launch downloads MongoDB 7.0.24; subsequent launches reuse it. Local MongoDB data persists in `.data/mongo`, which is excluded from Git. Initial fictional residents, rooms, and payments are seeded only into an empty database. Each hostel has six rooms. Demo monthly rents are ₹3,500 for three-bed rooms and ₹4,500 for two-bed rooms. Currency is INR (₹), formatted using the Indian numbering system, and rent is recorded in whole rupees.

No MongoDB account or Docker installation is needed for local development. The local launcher uses `mongodb-memory-server` to run a real MongoDB process with a persistent WiredTiger database. On Linux it requests the Ubuntu 22.04 binary, which requires OpenSSL 3. To reset demo data, stop the app and delete `.data/mongo`.

### Use your own MongoDB

Copy `.env.example` to `.env` and set `MONGODB_URI` to a MongoDB connection string. The local launcher then uses that database. Set `SEED_DEMO=false` to disable sample seeding and demo sign-in. Configure `WARDEN_EMAIL`, `WARDEN_PASSWORD` (8–128 characters), and optionally `WARDEN_NAME` to create your first warden account. Existing accounts keep their password on later restarts. Do not commit credentials.

## Build and serve

```bash
npm run build
# Configure MONGODB_URI in .env for a running MongoDB instance.
npm start
```

Express serves the built React app and API together at **http://localhost:3001**. It binds to `127.0.0.1` by default. `PORT` and `HOST` are configurable. `npm start` requires an existing MongoDB; automatic local MongoDB startup is provided by `npm run dev`.

## Verification

```bash
npm test
npm run build
```

Tests use a separate temporary MongoDB database and cover room assignment, payment integrity, role permissions, password login, session expiry/logout, private student records, password resets, requests, and seed data. Client tests cover HTML tunnel errors, incomplete JSON, network failures, and server validation messages.

## Project layout

```text
client/src/        React interface and CSS
server/src/        Express routes, Mongoose models, and demo seed
server/test/       Node test runner API integration tests
scripts/dev.mjs    Local MongoDB and app launcher
```

### API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Database readiness |
| GET | `/api/data` | Data allowed for the signed-in role |
| POST | `/api/auth/login` | Sign in as student or warden |
| GET | `/api/auth/me` | Current session |
| POST | `/api/auth/logout` | End session |
| POST | `/api/rooms` | Create a room |
| POST | `/api/residents` | Register a resident and allocate a free bed |
| POST | `/api/payments` | Warden records full monthly rent |
| PATCH | `/api/residents/:id/password` | Warden resets student login |
| POST | `/api/requests` | Student submits a hostel request |
| PATCH | `/api/requests/:id` | Warden updates request status |

## Room assignments

Every room belongs to either Boys Hostel or Girls Hostel. Registration requires an explicit gender: Male residents can only be assigned to Boys Hostel, and Female residents to Girls Hostel. The form offers only available beds in the matching hostel; the API also rejects incompatible assignments. Gender is never inferred from a resident’s name. Room numbers are globally unique; demo numbers use B- and G- prefixes.

## Sign in

The local demo shows **Try student demo** and **Try warden demo** buttons; these intentionally allow visitors to explore fictional data. Demo access is enabled only when `SEED_DEMO=true` (the local launcher defaults to true if unset). Disable it before using real resident records.

For regular accounts, wardens sign in with the credentials configured on the first startup. Wardens add a resident and set the initial student password. Students choose **Student login** and use their registered email and that password. A warden can reset a student password from the resident details dialog; resetting it invalidates the student's active sessions. Existing demo residents can use password login after a warden sets their password.

Passwords are salted and hashed with Node.js scrypt. Opaque sessions are stored in MongoDB for 24 hours and sent using HttpOnly, SameSite cookies (Secure over HTTPS). Students only receive their own records and cannot manage rooms, other residents, rent records, or request status. Authentication attempts are rate limited; browser mutations check request origin. Set `APP_ORIGIN` to the full frontend origin if your proxy rewrites the Host header. Production reverse proxies must connect through the trusted loopback interface.

## Shared review links and connection errors

Temporary tunnels only work while the workspace, MongoDB, app and tunnel remain running. If a tunnel returns an HTML error page, the client shows a connection message and keeps entered form details so you can retry after the host restores the service. Restarting a Cloudflare quick tunnel creates a new URL. Public links should point to the built app on Express port 3001.

## Scope

This is a simple educational project with a real Express backend and MongoDB persistence. Payment recording tracks payments received elsewhere; it does not charge cards or send email. Demo data and sign-in are for review. Use your own warden account, disable demo mode, and configure durable MongoDB storage, HTTPS, and backups for long-term use.
