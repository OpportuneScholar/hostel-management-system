import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.js';

test('HTML tunnel errors show a useful outage message instead of a JSON parser error', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<!doctype html><title>Tunnel error</title>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(api('residents', { name: 'Test' }), error => /temporarily unavailable/.test(error.message) && !/Unexpected token/.test(error.message));
});
test('incomplete JSON and network failures show retry guidance', async t => {
  const mocked = t.mock.method(globalThis, 'fetch', async () => new Response('{', { headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(api('data'), /incomplete response/);
  mocked.mock.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api('data'), /server is unavailable/);
});
test('API requests preserve server validation messages and send JSON with session cookies', async t => {
  let sent;
  const mocked = t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent = { url, options };
    return new Response(JSON.stringify({ message: 'This room is full.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  });
  await assert.rejects(api('residents', { name: 'Test' }), /This room is full/);
  assert.equal(sent.url, '/api/residents');
  assert.equal(sent.options.method, 'POST');
  assert.equal(sent.options.credentials, 'same-origin');
  assert.equal(sent.options.headers['Content-Type'], 'application/json');
  mocked.mock.mockImplementation(async () => new Response(JSON.stringify({ status: 'Resolved' }), { headers: { 'Content-Type': 'application/json' } }));
  assert.deepEqual(await api('requests/id', { status: 'Resolved' }, 'PATCH'), { status: 'Resolved' });
});
