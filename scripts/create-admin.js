const bcrypt = require('bcryptjs');
const db = require('../database/database');

const existing = db.prepare('SELECT id FROM admins').all();
if (existing.length > 0) {
  console.log('Admin already exists — skipping creation');
  process.exit(0);
}

const hash = bcrypt.hashSync('Sp3ctral#K9!xM@72', 12);
db.prepare("INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)")
  .run("Tanu'sCipherLore", 'admin@cipherlore.com', hash);

console.log('Admin created:', db.prepare('SELECT id, name FROM admins').all());
