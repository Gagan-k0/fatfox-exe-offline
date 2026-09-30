# KDS Real-Time Socket.io Fix (Critical Path)

## 🚨 The Issue
You have successfully built the offline API and migrated the POS/KDS endpoints. However, **the Kitchen Display System (KDS) real-time updates are currently broken.** 

In the online version, when a POS order is placed, the backend emits a Socket.io event which the Angular frontend listens to via `socket.io-client`. In the current offline build, the `app-offline.js` is a pure HTTP Express server with no WebSockets attached. 

If this is not fixed, the kitchen staff will have to manually refresh the KDS screen every time a new order is placed, which breaks the restaurant workflow.

---

## 🛠️ The Required Fix

You must implement a local Socket.io server on the embedded offline API so that the Angular frontend works **100% unchanged**.

### Step 1: Install Dependencies
Navigate into `fatfox-api-offline` and install Socket.io:
```bash
npm install socket.io
```

### Step 2: Attach Socket.io to the Offline Server
The Express app is likely launched from `bin/www` or `app-offline.js` (or `electron/embedded-api.js`). You need to:
1. Import `socket.io`.
2. Attach it to the HTTP server instance.
3. Configure CORS on the socket server to allow `http://localhost:4200` (the Angular frontend origin).
4. Store the `io` instance globally (e.g., `global.io = io;`) so controllers can access it to emit events.

*Example pattern:*
```javascript
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:4200", "http://127.0.0.1:4200"],
    methods: ["GET", "POST"]
  }
});
global.io = io;

io.on("connection", (socket) => {
  console.log("KDS Frontend connected via WebSockets");
});
```

### Step 3: Emit Events from Controllers
Inspect how the original online API emitted KDS events (usually inside `pickup.controller.js`, `table.controller.js`, or a dedicated `kitchen.controller.js`). 
Whenever an order is placed or a kitchen ticket status changes, you must call:
```javascript
if (global.io) {
  global.io.emit("new_kitchen_ticket", ticketData); // Use the exact event name the frontend expects
}
```

---

## 🔁 Autonomous QA & Verification Loop

You must act as a QA engineer and rigorously test that this fix works before moving to packaging.

1. **Code the Fix:** Implement Steps 1-3.
2. **Boot the API:** Run the offline API locally (`npm start` inside `fatfox-api-offline`). Ensure it does not crash on boot.
3. **Analyze Logs:** Write a temporary test script or use an API tester (like `curl` or a Node script) to submit a dummy Pickup order to the offline API.
4. **Verify Emission:** Add a `console.log` inside the `global.io.emit` wrapper to verify that placing an order *actually triggers* the socket emission.
5. **Self-Correction:** If the frontend origin throws a CORS error in the socket connection, adjust the `cors` block in the Socket.io initialization. If the event names don't match what Angular expects, grep the Angular source code (in `src/app/`) for `.on('` or `socket` to find the exact event names (e.g., `orderReceived`, `kdsUpdate`).

**DO NOT PROCEED to Step 10 (Electron Packaging) until you are 100% confident that the local Socket.io server is running alongside Express on port 4201 and emitting events correctly.**
