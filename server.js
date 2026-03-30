import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { DateTime } from 'luxon';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY || 'degistir-bunu';
const MAX_EVENTS = Math.max(1, Number(process.env.MAX_EVENTS || 300));

const SHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '';
const SHEET_TAB = process.env.GOOGLE_SHEETS_TAB_NAME || 'RawEvents';
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const CLUB_TIMEZONE = process.env.CLUB_TIMEZONE || 'Europe/Istanbul';
const CLUB_DAY_CUTOFF_HOUR = Number(process.env.CLUB_DAY_CUTOFF_HOUR || 5);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const state = {
  totalClicks: 0,
  devices: {},
  events: []
};

let sheetsClient = null;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  if (!SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return null;
  }

  const auth = new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

function getSortedDevices() {
  return Object.values(state.devices).sort((a, b) => {
    return (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '');
  });
}

function getPublicState() {
  return {
    totalClicks: state.totalClicks,
    devices: getSortedDevices(),
    events: state.events,
    sheetsEnabled: Boolean(getSheetsClient())
  };
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || null;
}

function ensureDevice(deviceId) {
  if (!state.devices[deviceId]) {
    state.devices[deviceId] = {
      deviceId,
      clickCount: 0,
      heartbeatCount: 0,
      lastSeenAt: null,
      lastHeartbeatAt: null,
      lastIp: null,
      lastRssi: null,
      lastBattery: null,
      lastDeviceTimestamp: null,
      lastUptimeMs: null
    };
  }
  return state.devices[deviceId];
}

function getClubFields(serverTimestampIso) {
  const local = DateTime.fromISO(serverTimestampIso, { zone: 'utc' }).setZone(CLUB_TIMEZONE);
  const businessBase = local.hour < CLUB_DAY_CUTOFF_HOUR ? local.minus({ days: 1 }) : local;

  const trWeekdays = {
    Monday: 'Pazartesi',
    Tuesday: 'Salı',
    Wednesday: 'Çarşamba',
    Thursday: 'Perşembe',
    Friday: 'Cuma',
    Saturday: 'Cumartesi',
    Sunday: 'Pazar'
  };

  const englishDay = businessBase.toFormat('cccc');
  const clubDayName = trWeekdays[englishDay] || englishDay;

  return {
    eventLocalTime: local.toFormat('yyyy-LL-dd HH:mm:ss'),
    clubBusinessDate: businessBase.toFormat('yyyy-LL-dd'),
    clubDayName,
    clubHour: local.hour,
    clubHourLabel: local.toFormat('HH:00'),
    clubSessionKey: `${businessBase.toFormat('yyyy-LL-dd')} ${clubDayName}`
  };
}

async function ensureSheetHeader() {
  const sheets = getSheetsClient();
  if (!sheets) return false;

  const header = [[
    'server_timestamp_utc',
    'event_type',
    'device_id',
    'seq',
    'rssi',
    'battery',
    'ip',
    'device_timestamp_ms',
    'server_unix_ms',
    'event_local_time',
    'club_business_date',
    'club_day_name',
    'club_hour',
    'club_hour_label',
    'club_session_key'
  ]];

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A1:O1`
    });

    const values = res.data.values || [];
    if (values.length > 0 && values[0]?.length > 0) return true;
  } catch (err) {
    console.error('Sheet header check failed:', err?.message || err);
  }

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A1:O1`,
      valueInputOption: 'RAW',
      requestBody: { values: header }
    });
    return true;
  } catch (err) {
    console.error('Sheet header write failed:', err?.message || err);
    return false;
  }
}

async function appendEventToSheet({
  eventType,
  deviceId,
  seq = '',
  rssi = '',
  battery = '',
  ip = '',
  deviceTimestamp = '',
  serverTimestamp,
  serverUnixMs
}) {
  const sheets = getSheetsClient();
  if (!sheets) return { ok: false, skipped: true, reason: 'sheets_not_configured' };

  const club = getClubFields(serverTimestamp);
  const values = [[
    serverTimestamp,
    eventType,
    deviceId,
    seq,
    rssi,
    battery,
    ip,
    deviceTimestamp,
    serverUnixMs,
    club.eventLocalTime,
    club.clubBusinessDate,
    club.clubDayName,
    club.clubHour,
    club.clubHourLabel,
    club.clubSessionKey
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:O`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });

  return { ok: true };
}

function pushEvent(event) {
  state.events.unshift(event);
  if (state.events.length > MAX_EVENTS) {
    state.events.length = MAX_EVENTS;
  }
}

function authOk(req) {
  return req.get('x-api-key') === API_KEY;
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
    sheetsEnabled: Boolean(getSheetsClient()),
    now: new Date().toISOString()
  });
});

app.get('/api/state', (req, res) => {
  res.json(getPublicState());
});

app.post('/api/click', async (req, res) => {
  if (!authOk(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const body = req.body || {};
  const deviceId = String(body.deviceId || '').trim();
  if (!deviceId) {
    return res.status(400).json({ ok: false, error: 'deviceId required' });
  }

  const now = new Date();
  state.totalClicks += 1;

  const device = ensureDevice(deviceId);
  device.clickCount += 1;
  device.lastSeenAt = now.toISOString();
  device.lastIp = getClientIp(req);
  device.lastRssi = toNumberOrNull(body.rssi);
  device.lastBattery = body.battery ?? null;
  device.lastDeviceTimestamp = body.deviceTimestamp ?? body.millis ?? null;

  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    seq: state.totalClicks,
    type: 'click',
    deviceId,
    serverTimestamp: now.toISOString(),
    serverUnixMs: now.getTime(),
    deviceTimestamp: device.lastDeviceTimestamp,
    ip: device.lastIp,
    rssi: device.lastRssi,
    battery: device.lastBattery
  };

  pushEvent(event);

  let sheetLogged = false;
  try {
    await appendEventToSheet({
      eventType: 'click',
      deviceId: event.deviceId,
      seq: event.seq,
      rssi: event.rssi ?? '',
      battery: event.battery ?? '',
      ip: event.ip ?? '',
      deviceTimestamp: event.deviceTimestamp ?? '',
      serverTimestamp: event.serverTimestamp,
      serverUnixMs: event.serverUnixMs
    });
    sheetLogged = true;
  } catch (err) {
    console.error('Sheets click log failed:', err?.message || err);
  }

  io.emit('click', event);
  io.emit('state', getPublicState());

  return res.json({ ok: true, event, sheetLogged });
});

app.post('/api/heartbeat', async (req, res) => {
  if (!authOk(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const body = req.body || {};
  const deviceId = String(body.deviceId || '').trim();
  if (!deviceId) {
    return res.status(400).json({ ok: false, error: 'deviceId required' });
  }

  const now = new Date();
  const device = ensureDevice(deviceId);
  device.heartbeatCount += 1;
  device.lastSeenAt = now.toISOString();
  device.lastHeartbeatAt = now.toISOString();
  device.lastIp = getClientIp(req);
  device.lastRssi = toNumberOrNull(body.rssi);
  device.lastBattery = body.battery ?? null;
  device.lastDeviceTimestamp = body.deviceTimestamp ?? body.millis ?? null;
  device.lastUptimeMs = toNumberOrNull(body.uptimeMs);

  let sheetLogged = false;
  try {
    await appendEventToSheet({
      eventType: 'heartbeat',
      deviceId: device.deviceId,
      seq: '',
      rssi: device.lastRssi ?? '',
      battery: device.lastBattery ?? '',
      ip: device.lastIp ?? '',
      deviceTimestamp: device.lastDeviceTimestamp ?? '',
      serverTimestamp: now.toISOString(),
      serverUnixMs: now.getTime()
    });
    sheetLogged = true;
  } catch (err) {
    console.error('Sheets heartbeat log failed:', err?.message || err);
  }

  io.emit('state', getPublicState());

  return res.json({
    ok: true,
    serverTimestamp: now.toISOString(),
    device,
    sheetLogged
  });
});

io.on('connection', (socket) => {
  socket.emit('state', getPublicState());
});

server.listen(PORT, async () => {
  console.log(`ESP01 clicker listening on ${PORT}`);
  if (getSheetsClient()) {
    const headerReady = await ensureSheetHeader();
    console.log(`Google Sheets logging ${headerReady ? 'ready' : 'not ready yet'}`);
  } else {
    console.log('Google Sheets logging disabled: missing env vars');
  }
});
