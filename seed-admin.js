require('dotenv').config();
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

async function main() {
  const { MONGODB_URI, MONGODB_DB_NAME, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!MONGODB_URI || !MONGODB_DB_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Set MONGODB_URI, MONGODB_DB_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in .env first.');
  }
  if (ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const users = client.db(MONGODB_DB_NAME).collection('users');
    await users.createIndex({ email: 1 }, { unique: true });
    const email = ADMIN_EMAIL.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const result = await users.updateOne(
      { email },
      {
        $set: {
          fullName: ADMIN_NAME || 'Parking Kothay Admin',
          email,
          passwordHash,
          role: 'admin',
          status: 'active',
          updatedAt: new Date()
        },
        $setOnInsert: { createdAt: new Date(), phone: '', address: '' }
      },
      { upsert: true }
    );
    console.log(result.upsertedCount ? 'Administrator account created.' : 'Administrator account updated.');
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
