import 'dotenv/config';
import mongoose from 'mongoose';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import app from './app.js';
import { Room, Resident, Payment, Warden, Session, ServiceRequest } from './models.js';
import { seedDemo } from './seed.js';
import { prepareAccounts } from './auth.js';
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/haven');
await Promise.all([Room.init(), Resident.init(), Payment.init(), Warden.init(), Session.init(), ServiceRequest.init()]);
if (process.env.SEED_DEMO === 'true') await seedDemo();
await prepareAccounts();
const clientDist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*path}', (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(`${clientDist}/index.html`); });
}
const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () => console.log('Haven API ready'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await mongoose.disconnect(); process.exit(0); }));
