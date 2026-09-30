'use strict';

/**
 * Local Socket.io layer for the offline EXE.
 *
 * Online KDS uses Firebase RTDB pings at `data/kds/<restaurantId>` with
 * `{ status: 'kds_work_changed', eventId, ... }`. The Angular dashboard
 * (`subscribeToRestaurantKds`) treats those as a hint and then re-reads the
 * REST feed. Offline we emit the same payload over Socket.io so the kitchen
 * screen updates without a manual refresh.
 */

const { Server } = require('socket.io');
const { generateId } = require('./offline-db-adapter');

const KDS_WORK_CHANGED = 'kds_work_changed';
const NEW_KITCHEN_TICKET = 'new_kitchen_ticket';
const KDS_CHANNEL_PREFIX = 'kds:';

let ioInstance = null;

function corsOrigins() {
  const extra = String(process.env.OFFLINE_CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'http://localhost:4201',
    'http://127.0.0.1:4201',
    ...extra
  ];
}

function attachSocket(httpServer, options = {}) {
  if (!httpServer) throw new Error('attachSocket requires an http.Server');
  if (ioInstance) {
    try { ioInstance.removeAllListeners(); } catch (_) { /* ignore */ }
  }

  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins(),
      methods: ['GET', 'POST'],
      credentials: true
    },
    path: options.path || '/socket.io',
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    console.log('[offline-socket] KDS frontend connected', socket.id);

    socket.on('join', (room) => {
      if (typeof room === 'string' && room.trim()) {
        socket.join(room.trim());
      }
    });

    socket.on('kds:subscribe', (payload) => {
      const restaurantId = payload && (payload.restaurantId || payload.restaurant_id);
      if (restaurantId) socket.join(kdsRoom(restaurantId));
    });

    socket.on('disconnect', (reason) => {
      console.log('[offline-socket] disconnected', socket.id, reason);
    });
  });

  ioInstance = io;
  global.io = io;
  return io;
}

function getIo() {
  return ioInstance || global.io || null;
}

function kdsRoom(restaurantId) {
  return KDS_CHANNEL_PREFIX + String(restaurantId);
}

function buildKdsPayload(restaurantId, extras = {}) {
  const departmentId = extras.departmentId || extras.department_id || 'GENERAL';
  return {
    childId: String(restaurantId),
    departmentId: String(departmentId),
    status: KDS_WORK_CHANGED,
    revision: extras.revision || Date.now(),
    eventId: extras.eventId || generateEventId(),
    updatedAt: extras.updatedAt || new Date().toISOString(),
    orderId: extras.orderId || extras.order_id || null,
    source: extras.source || 'offline'
  };
}

function generateEventId() {
  try {
    return generateId();
  } catch (_) {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}

/**
 * Emit a KDS work-changed ping.
 * Safe no-op when Socket.io is not attached (unit tests, early boot).
 */
function emitKdsWorkChanged(restaurantId, extras = {}) {
  if (!restaurantId) return null;
  const io = getIo();
  const payload = buildKdsPayload(restaurantId, extras);
  if (!io) {
    if (process.env.NODE_ENV !== 'test') {
      console.log('[offline-socket] emit skipped (no io):', payload.status, payload.eventId);
    }
    return payload;
  }

  io.emit(KDS_WORK_CHANGED, payload);
  io.emit(NEW_KITCHEN_TICKET, payload);
  io.to(kdsRoom(restaurantId)).emit(KDS_WORK_CHANGED, payload);
  console.log('[offline-socket] emit', KDS_WORK_CHANGED, payload.eventId, 'rest', restaurantId);
  return payload;
}

function closeSocket() {
  return new Promise((resolve) => {
    if (!ioInstance) return resolve();
    const io = ioInstance;
    ioInstance = null;
    if (global.io === io) global.io = null;
    io.close(() => resolve());
  });
}

module.exports = {
  attachSocket,
  getIo,
  emitKdsWorkChanged,
  closeSocket,
  kdsRoom,
  buildKdsPayload,
  KDS_WORK_CHANGED,
  NEW_KITCHEN_TICKET
};
