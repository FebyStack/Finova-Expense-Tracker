const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function exportCollection(colName) {
  const snapshot = await db.collectionGroup(colName).get();
  const records  = [];

  snapshot.forEach(doc => {
    records.push({
      firebase_id: doc.id,
      ...doc.data(),
    });
  });

  return records;
}

async function exportAll() {
  console.log('Connecting to Firestore...');

  const outDir = './firebase-export';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  // Get all users first
  const usersSnap = await db.collection('users').get();
  const users = [];

  usersSnap.forEach(doc => {
    users.push({ firebase_id: doc.id, uid: doc.id, ...doc.data() });
  });

  fs.writeFileSync(`${outDir}/users.json`, JSON.stringify(users, null, 2));
  console.log(`  ✓ users: ${users.length} records`);

  // For each sub-collection, fetch per user so uid is always attached
  const subCollections = ['expenses', 'income', 'budgets', 'savings', 'receipts', 'uploads'];

  for (const col of subCollections) {
    const allRecords = [];

    for (const user of users) {
      const snap = await db
        .collection('users')
        .doc(user.uid)
        .collection(col)
        .get();

      snap.forEach(doc => {
        allRecords.push({
          firebase_id: doc.id,
          uid: user.uid,        // ← always attached now
          ...doc.data(),
        });
      });
    }

    fs.writeFileSync(
      `${outDir}/${col}.json`,
      JSON.stringify(allRecords, null, 2)
    );
    console.log(`  ✓ ${col}: ${allRecords.length} records`);
  }

  console.log('\nExport complete! Files saved to ./firebase-export/');
  process.exit(0);
}

exportAll().catch(err => {
  console.error('Export failed:', err.message);
  process.exit(1);
});