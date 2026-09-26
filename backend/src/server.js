import { createApp } from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';

async function start() {
  try {
    await connectDatabase();
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Could not connect to MongoDB:', error.message);
    console.error(`Check that MONGODB_URI is reachable (${env.mongoUri}).`);
    process.exit(1);
  }

  createApp().listen(env.port, '0.0.0.0', () => {
    console.log(`API listening on http://0.0.0.0:${env.port}/api`);
  });
}

start();
