// Admin is now created automatically by database/database.js on first startup.
// This script just verifies the setup is working.
const { ready } = require('../database/database');
ready.then(() => {
  console.log('Database initialized — admin account is ready.');
  process.exit(0);
}).catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
