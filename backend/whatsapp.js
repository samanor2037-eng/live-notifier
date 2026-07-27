// Sends WhatsApp notifications from one personal WhatsApp account, linked by
// scanning a QR code (Baileys' WhatsApp Web protocol client), to each app
// user's own WhatsApp number. This is not the official Meta Business API.
//
// Render's free tier has no persistent disk, so the paired session (which
// Baileys normally writes to local files) is stored in the Supabase
// `settings` table instead, keyed 'whatsapp_session', so it survives backend
// restarts without needing the QR re-scanned every time.
const {
  makeWASocket,
  DisconnectReason,
  initAuthCreds,
  BufferJSON,
  proto,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');

const SESSION_KEY = 'whatsapp_session';
const logger = pino({ level: 'silent' });

let sock = null;
let currentQR = null;
let isConnected = false;
let supabaseRef = null;

async function loadSession(supabase) {
  const { data } = await supabase.from('settings').select('value').eq('key', SESSION_KEY).single();
  if (!data || !data.value) return null;
  return JSON.parse(JSON.stringify(data.value), BufferJSON.reviver);
}

async function saveSession(supabase, creds, keys) {
  const value = JSON.parse(JSON.stringify({ creds, keys }, BufferJSON.replacer));
  const { error } = await supabase.from('settings').upsert({ key: SESSION_KEY, value });
  if (error) console.error('Failed to save WhatsApp session:', error.message);
}

async function useSupabaseAuthState(supabase) {
  const stored = await loadSession(supabase);
  const creds = stored?.creds || initAuthCreds();
  const keys = stored?.keys || {};

  const persist = () => saveSession(supabase, creds, keys);

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            let value = keys[type]?.[id];
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            if (value !== undefined) data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          for (const category in data) {
            keys[category] = keys[category] || {};
            for (const id in data[category]) {
              const value = data[category][id];
              if (value) {
                keys[category][id] = value;
              } else {
                delete keys[category][id];
              }
            }
          }
          await persist();
        },
      },
    },
    saveCreds: persist,
  };
}

async function initWhatsApp(supabase) {
  supabaseRef = supabase;
  const { state, saveCreds } = await useSupabaseAuthState(supabase);

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    browser: ['Veonotes', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      isConnected = false;
    }

    if (connection === 'open') {
      currentQR = null;
      isConnected = true;
      console.log('WhatsApp connected.');
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log(`WhatsApp connection closed (code ${statusCode}). ${loggedOut ? 'Logged out — scan a new QR at /api/whatsapp/qr.' : 'Reconnecting...'}`);
      if (!loggedOut) {
        setTimeout(() => initWhatsApp(supabase), 3000);
      }
    }
  });
}

function getStatus() {
  return { connected: isConnected, hasQr: !!currentQR };
}

async function getQrImageDataUrl() {
  if (!currentQR) return null;
  return QRCode.toDataURL(currentQR);
}

function normalizePhoneNumber(phone) {
  return (phone || '').replace(/[^0-9]/g, '');
}

async function sendWhatsAppMessage(phone, text) {
  if (!sock || !isConnected) {
    console.log('WhatsApp not connected. Skipping message.');
    return { success: false, error: 'WhatsApp not connected' };
  }
  const digits = normalizePhoneNumber(phone);
  if (!digits) {
    return { success: false, error: 'Invalid phone number' };
  }
  try {
    // A stale-but-not-yet-detected connection can leave sendMessage's promise
    // hanging indefinitely, so bound it instead of trusting isConnected alone.
    await Promise.race([
      sock.sendMessage(`${digits}@s.whatsapp.net`, { text }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('WhatsApp send timed out')), 20000)),
    ]);
    return { success: true };
  } catch (err) {
    console.error(`Failed to send WhatsApp message to ${digits}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { initWhatsApp, sendWhatsAppMessage, getStatus, getQrImageDataUrl, normalizePhoneNumber };
