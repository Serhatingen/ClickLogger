import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY || 'degistir-bunu';
const MAX_EVENTS = Math.max(1, Number(process.env.MAX_EVENTS || 300));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const state = {
  totalClicks: 0,
  devices: {},
  events: []
};

function getSortedDevices() {
  return Object.values(state.devices).sort((a, b) => {
    return (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '');
  });
}

function getPublicState() {
  return {
    totalClicks: state.totalClicks,
    devices: getSortedDevices(),
    events: state.events
  };
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function makeEvent({ deviceId, ip, rssi, battery, sourceTs }) {
  const now = new Date();
  state.totalClicks += 1;

  if (!state.devices[deviceId]) {
    state.devices[deviceId] = {
      deviceId,
      clickCount: 0,
      lastSeenAt: null,
      lastIp: null,
      lastRssi: null,
      lastBattery: null,
      lastDeviceTimestamp: null
    };
  }

  const device = state.devices[deviceId];
  device.clickCount += 1;
  device.lastSeenAt = now.toISOString();
  device.lastIp = ip || null;
  device.lastRssi = rssi;
  device.lastBattery = battery;
  device.lastDeviceTimestamp = sourceTs;

  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    seq: state.totalClicks,
    deviceId,
    serverTimestamp: now.toISOString(),
    serverUnixMs: now.getTime(),
    deviceTimestamp: sourceTs,
    ip: ip || null,
    rssi,
    battery
  };

  state.events.unshift(event);
  if (state.events.length > MAX_EVENTS) {
    state.events.length = MAX_EVENTS;
  }

  return event;
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    totalClicks: state.totalClicks,
    deviceCount: Object.keys(state.devices).length,
    retainedEvents: state.events.length,
    now: new Date().toISOString()
  });
});

app.get('/api/state', (req, res) => {
  res.json(getPublicState());
});

app.post('/api/click', (req, res) => {
  const auth = req.get('x-api-key');
  if (auth !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const body = req.body || {};
  const deviceId = String(body.deviceId || '').trim();
  if (!deviceId) {
    return res.status(400).json({ ok: false, error: 'deviceId required' });
  }

  const event = makeEvent({
    deviceId,
    ip: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || null,
    rssi: toNumberOrNull(body.rssi),
    battery: body.battery ?? null,
    sourceTs: body.deviceTimestamp ?? body.millis ?? null
  });

  const publicState = getPublicState();
  io.emit('click', event);
  io.emit('state', publicState);

  return res.json({ ok: true, event });
});

io.on('connection', (socket) => {
  socket.emit('state', getPublicState());
});

server.listen(PORT, () => {
  console.log(`ESP01 clicker listening on ${PORT}`);
});
