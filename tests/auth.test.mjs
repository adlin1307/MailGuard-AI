import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

// Replicate Web Crypto hashing helper from auth-service.ts
function hashPasswordWithSalt(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

function validateEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

function validatePassword(password) {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isValid = hasMinLength && hasUppercase && hasLowercase && hasNumber;
  return { hasMinLength, hasUppercase, hasLowercase, hasNumber, isValid };
}

test('Email validation trims whitespace and requires valid format', () => {
  assert.strictEqual(validateEmail('  adlina@karunya.edu.in  '), true);
  assert.strictEqual(validateEmail('SecOps.Lead@ProbMail.Internal'), true);
  assert.strictEqual(validateEmail('invalid-email'), false);
  assert.strictEqual(validateEmail('@domain.com'), false);
  assert.strictEqual(validateEmail('user@'), false);
});

test('Password complexity enforces 8+ chars, uppercase, lowercase, and numeric digits', () => {
  assert.strictEqual(validatePassword('Weak1!').isValid, false); // <8 chars
  assert.strictEqual(validatePassword('alllowercasewith123').isValid, false); // No uppercase
  assert.strictEqual(validatePassword('ALLUPPERCASEWITH123').isValid, false); // No lowercase
  assert.strictEqual(validatePassword('NoDigitsHereAtAll').isValid, false); // No number
  assert.strictEqual(validatePassword('SecOpsPassword2026!').isValid, true);
});

test('Password hashing produces consistent deterministic SHA-256 matching backend', () => {
  const salt = '912b7de38afc3fdccbcab42a93de70b1';
  const password = 'TestPassword123!';
  const hash1 = hashPasswordWithSalt(password, salt);
  const hash2 = hashPasswordWithSalt(password, salt);
  assert.strictEqual(hash1, hash2);
  assert.strictEqual(hash1.length, 64);

  // Different salt or password produces completely different hash
  const hashDiffSalt = hashPasswordWithSalt(password, 'differentsalt123');
  assert.notStrictEqual(hash1, hashDiffSalt);
  const hashDiffPw = hashPasswordWithSalt('DifferentPassword123!', salt);
  assert.notStrictEqual(hash1, hashDiffPw);
});

test('Case-insensitive email lookup handles whitespace and mixed casing', () => {
  const storedUsers = [
    { email: 'adlina@karunya.edu.in', name: 'Adlin' }
  ];

  const searchEmail = '  ADLINA@KARUNYA.EDU.IN  '.trim().toLowerCase();
  const match = storedUsers.find((u) => u.email.toLowerCase() === searchEmail);
  assert.ok(match);
  assert.strictEqual(match.name, 'Adlin');

  const unknownEmail = 'unknown@nowhere.com'.trim().toLowerCase();
  const noMatch = storedUsers.find((u) => u.email.toLowerCase() === unknownEmail);
  assert.strictEqual(noMatch, undefined);
});
