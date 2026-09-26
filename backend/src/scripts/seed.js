import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { seedDemoData } from './seedData.js';

async function seed() {
  await connectDatabase();
  const credentials = await seedDemoData();

  console.log('Seeded demo data.');
  console.log(`  email:    ${credentials.email}`);
  console.log(`  password: ${credentials.password}`);

  await disconnectDatabase();
}

seed().catch(async (error) => {
  console.error(error);
  await disconnectDatabase();
  process.exit(1);
});
