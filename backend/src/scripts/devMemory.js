/**
 * Runs the API against a throwaway in-memory MongoDB and seeds the demo
 * account. Handy before you have a real MongoDB; data disappears on exit.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { seedDemoData } from './seedData.js';

const mongo = await MongoMemoryServer.create();
await connectDatabase(mongo.getUri('jobtracker'));
console.log('Connected to an in-memory MongoDB (data is not persisted)');

const credentials = await seedDemoData();
console.log(`Demo login: ${credentials.email} / ${credentials.password}`);

const server = createApp().listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}/api`);
});

async function shutdown() {
  server.close();
  await disconnectDatabase();
  await mongo.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
