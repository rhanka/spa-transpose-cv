import { pbkdf2Sync, randomBytes } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node api/scripts/hash-admin-password.mjs <password>');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const hash = pbkdf2Sync(password, salt, 210_000, 32, 'sha256').toString('hex');

console.log(`ADMIN_PASSWORD_SALT=${salt}`);
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
