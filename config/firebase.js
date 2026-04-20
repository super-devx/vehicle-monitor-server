require('dotenv').config();
const path = require('path');
const admin = require('firebase-admin');

const credPath = path.resolve(process.env.FIREBASE_CREDENTIALS_PATH || './firebase-service-account.json');
if (!require('fs').existsSync(credPath)) {
  console.error(`\n[firebase] ERROR: service account file not found at ${credPath}`);
  console.error('[firebase] Download it from Firebase Console → Project Settings → Service Accounts → Generate new private key');
  console.error('[firebase] Then place it at: ' + credPath + '\n');
  process.exit(1);
}
const serviceAccount = require(credPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL,
});

const db = admin.database();
const TIMESTAMP = admin.database.ServerValue.TIMESTAMP;

async function saveSensorReading(reading) {
  const payload = { ...reading, serverTs: TIMESTAMP };
  try {
    await Promise.all([
      db.ref('history').push(payload),
      db.ref('live').set(payload),
    ]);
  } catch (err) {
    console.error('[firebase] saveSensorReading failed:', err.message);
  }
}

async function saveEvent(event) {
  const payload = { ...event, serverTs: TIMESTAMP };
  try {
    await db.ref('events').push(payload);
  } catch (err) {
    console.error('[firebase] saveEvent failed:', err.message);
  }
}

module.exports = { saveSensorReading, saveEvent };
