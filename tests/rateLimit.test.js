// Runs in its own process (node --test isolates files), so a low limit here does not affect other tests.
process.env.AUTH_RATE_LIMIT_MAX = '3';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase } = require('./helpers');

let request, app, db;
before(async () => {
  await resetDatabase({ seed: false });
  request = require('supertest');
  app = require('../server');
  db = require('../config/db');
});
after(() => db && db.end());

test('login is rate limited per IP', async () => {
  const codes = [];
  for (let i = 0; i < 5; i++) {
    codes.push((await request(app).post('/api/users/login').send({ email: 'x@example.com', password: 'wrong-pass1' })).status);
  }
  assert.deepEqual(codes, [401, 401, 401, 429, 429]);
});
