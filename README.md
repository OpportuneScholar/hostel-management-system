# Haven — Hostel management system

A simple MERN project for managing a hostel’s rooms, residents, and monthly rent. Built with MongoDB, Express, React, and Node.js.

## Features

- Overview with live resident totals, occupancy, available beds, and rent collections
- Separate Boys Hostel and Girls Hostel blocks, with a hostel filter for overview, residents, rooms, and payments
- Resident registration with gender, matching hostel assignment, search, rent status filters, and details
- Room creation with floor, bed capacity, monthly rent, and availability
- Monthly payment recording, searchable payment history, and pending rent totals
- Server validation, duplicate email/payment prevention, and concurrent-safe bed assignment
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

Copy `.env.example` to `.env` and set `MONGODB_URI` to a MongoDB connection string. The local launcher then uses that database. Set `SEED_DEMO=false` to start without sample data. Do not commit credentials.

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

Tests use a separate temporary MongoDB database and cover concurrent room assignment, duplicate email/payment handling, payment amounts, validation, separate hostel assignments, and seed data integrity.

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
| GET | `/api/data` | Rooms, residents, and payments |
| POST | `/api/rooms` | Create a room |
| POST | `/api/residents` | Register a resident and allocate a free bed |
| POST | `/api/payments` | Record full rent for a resident and month |

## Room assignments

Every room belongs to either Boys Hostel or Girls Hostel. Registration requires an explicit gender: Male residents can only be assigned to Boys Hostel, and Female residents to Girls Hostel. The form offers only available beds in the matching hostel; the API also rejects incompatible assignments. Gender is never inferred from a resident’s name. Room numbers are globally unique; demo numbers use B- and G- prefixes.

## Scope

This is a local educational demo. The administrator profile and hostel name are presentation defaults. There is no login, authorization, payment gateway, or outgoing email; payment recording tracks payments received elsewhere. Add authentication, access controls, backups, and production configuration before using it publicly or with real resident data.
