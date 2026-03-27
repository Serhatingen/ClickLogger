import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'degistir-bunu';
const MAX_EVENTS = Number(process.env.MAX_EVENTS || 300);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
const state = {
  totalClicks: 0,
  devices: {},
  events: []
};

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

  state.devices[deviceId].clickCount += 1;
  state.devices[deviceId].lastSeenAt = now.toISOString();
  state.devices[deviceId].lastIp = ip || null;
  state.devices[deviceId].lastRssi = typeof rssi === 'number' ? rssi : null;
  state.devices[deviceId].lastBattery = battery ?? null;
  state.devices[deviceId].lastDeviceTimestamp = sourceTs ?? null;

  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    seq: state.totalClicks,
    deviceId,
    serverTimestamp: now.toISOString(),
    serverUnixMs: now.getTime(),
    deviceTimestamp: sourceTs ?? null,
    ip: ip || null,
    rssi: typeof rssi === 'number' ? rssi : null,
    battery: battery ?? null
  };

  state.events.unshift(event);
  if (state.events.length > MAX_EVENTS) {
    state.events.length = MAX_EVENTS;
  }

  return event;
}

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
  res.json({
    totalClicks: state.totalClicks,
    devices: Object.values(state.devices).sort((a, b) => {
      return (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '');
    }),
    events: state.events
  });
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
    ip: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress,
    rssi: Number.isFinite(body.rssi) ? body.rssi : Number(body.rssi),
    battery: body.battery ?? null,
    sourceTs: body.deviceTimestamp ?? body.millis ?? null
  });

  io.emit('click', event);
  io.emit('state', {
    totalClicks: state.totalClicks,
    devices: Object.values(state.devices).sort((a, b) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '')),
    events: state.events
  });

  res.json({ ok: true, event });
});

io.on('connection', (socket) => {
  socket.emit('state', {
    totalClicks: state.totalClicks,
    devices: Object.values(state.devices).sort((a, b) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '')),
    events: state.events
  });
});

server.listen(PORT, () => {
  console.log(`ESP01 clicker listening on ${PORT}`);
});
