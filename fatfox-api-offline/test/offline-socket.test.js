'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-socket-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.OFFLINE_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(48);

const {
  attachSocket,
  emitKdsWorkChanged,
  closeSocket,
  getIo,
  kdsRoom,
  KDS_WORK_CHANGED,
  NEW_KITCHEN_TICKET
} = require('../helpers/offline-socket');

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('emitKdsWorkChanged is a safe no-op when io is not attached', () => {
  const payload = emitKdsWorkChanged('rest-1', { orderId: 'ord-1', source: 'unit' });
  assert.ok(payload);
  assert.equal(payload.status, KDS_WORK_CHANGED);
  assert.equal(payload.childId, 'rest-1');
  assert.equal(payload.orderId, 'ord-1');
  assert.equal(payload.source, 'unit');
  assert.ok(payload.eventId);
  assert.ok(payload.updatedAt);
});

test('socket.io emits kds_work_changed and new_kitchen_ticket', async () => {
  const app = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });

  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const io = attachSocket(app);
  assert.ok(getIo());
  assert.equal(io, getIo());

  const received = { kds: [], ticket: [], room: [] };

  io.on('connection', (socket) => {
    socket.join(kdsRoom('rest-42'));
    socket.on(KDS_WORK_CHANGED, (payload) => received.kds.push(payload));
    socket.on(NEW_KITCHEN_TICKET, (payload) => received.ticket.push(payload));
  });

  // Capture broadcasts from the server side (what clients would receive).
  const origEmit = io.emit.bind(io);
  const origTo = io.to.bind(io);
  io.emit = function patchedEmit(event, ...args) {
    if (event === KDS_WORK_CHANGED) received.kds.push(args[0]);
    if (event === NEW_KITCHEN_TICKET) received.ticket.push(args[0]);
    return origEmit(event, ...args);
  };
  io.to = function patchedTo(room) {
    const adapter = origTo(room);
    const origRoomEmit = adapter.emit.bind(adapter);
    adapter.emit = function patchedRoomEmit(event, ...args) {
      if (event === KDS_WORK_CHANGED) received.room.push(args[0]);
      return origRoomEmit(event, ...args);
    };
    return adapter;
  };

  const payload = emitKdsWorkChanged('rest-42', {
    orderId: 'order-99',
    source: 'pickup.create'
  });

  await waitFor(50);

  assert.ok(received.kds.length >= 1, 'expected kds_work_changed broadcast');
  assert.ok(received.ticket.length >= 1, 'expected new_kitchen_ticket broadcast');
  assert.ok(received.room.length >= 1, 'expected room-targeted kds_work_changed');
  const kds = received.kds[0];
  assert.equal(kds.status, 'kds_work_changed');
  assert.equal(kds.childId, 'rest-42');
  assert.equal(kds.orderId, 'order-99');
  assert.equal(kds.source, 'pickup.create');
  assert.equal(kds.eventId, payload.eventId);
  assert.equal(kdsRoom('rest-42'), 'kds:rest-42');

  await closeSocket();
  await new Promise((resolve) => app.close(resolve));
});
