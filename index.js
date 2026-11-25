require('dotenv').config();
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');

const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;
const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID;
const PREFIXES = (process.env.BUG_PREFIXES || process.env.BUG_PREFIX || '#bug,#improvement,#feature,#feedback')
  .split(',')
  .map((p) => p.trim().toLowerCase())
  .filter(Boolean);
const PORT = process.env.PORT || 3000;

// Keep-alive HTTP server (required for Koyeb / Render free tier health checks)
const app = express();
let connectionStatus = 'starting';
let latestQr = null;

app.get('/', (_req, res) => {
  res.json({ status: connectionStatus, prefixes: PREFIXES });
});

app.get('/qr', (_req, res) => {
  if (!latestQr) {
    return res.send(`<h3>Status: ${connectionStatus}</h3><p>QR belum tersedia atau sudah tersambung. Refresh beberapa detik lagi.</p>`);
  }
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(latestQr)}`;
  res.send(`
    <html><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
      <h2>Scan QR WhatsApp</h2>
      <img src="${qrImgUrl}" alt="QR Code" />
      <p>Status: ${connectionStatus}</p>
    </body></html>
  `);
});

app.listen(PORT, () => {
  console.log(`Health check server running on port ${PORT}`);
});

async function createClickUpTask(title, description, imageBuffer, mimeType) {
  if (!CLICKUP_API_TOKEN || !CLICKUP_LIST_ID) {
    throw new Error('Missing CLICKUP_API_TOKEN or CLICKUP_LIST_ID in environment variables');
  }

  const taskRes = await axios.post(
    `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`,
    {
      name: title,
      description,
    },
    {
      headers: {
        Authorization: CLICKUP_API_TOKEN,
        'Content-Type': 'application/json',
      },
    }
  );

  const taskId = taskRes.data.id;

  if (imageBuffer) {
    const ext = mimeType?.split('/')[1]?.split(';')[0] || 'jpg';
    const form = new FormData();
    form.append('attachment', imageBuffer, {
      filename: `screenshot.${ext}`,
      contentType: mimeType || 'image/jpeg',
    });

    await axios.post(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      form,
      {
        headers: {
          Authorization: CLICKUP_API_TOKEN,
          ...form.getHeaders(),
        },
      }
    );
  }

  return taskRes.data;
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      connectionStatus = 'waiting_for_qr_scan';
      console.log('\nBuka /qr di browser untuk scan QR Code.\n');
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      connectionStatus = shouldReconnect ? 'reconnecting' : 'logged_out';
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      console.log('WhatsApp Bot connected!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';

      const trimmed = text.trim();
      const lower = trimmed.toLowerCase();
      const matchedPrefix = PREFIXES.find((p) => lower.startsWith(p));
      if (!matchedPrefix) continue;

      const cleanText = trimmed.slice(matchedPrefix.length).trim();
      if (!cleanText) continue;

      const tagLabel = matchedPrefix.replace(/^#/, '').toUpperCase();
      const senderName = msg.pushName || msg.key.participant || msg.key.remoteJid;
      const title = `[${tagLabel}] ${cleanText.split('\n')[0].slice(0, 80)}`;
      const description = `${cleanText}\n\nPelapor: ${senderName}`;

      let imageBuffer = null;
      let mimeType = null;

      if (msg.message.imageMessage) {
        try {
          imageBuffer = await downloadMediaMessage(msg, 'buffer', {});
          mimeType = msg.message.imageMessage.mimetype;
        } catch (err) {
          console.error('Failed to download image:', err.message);
        }
      }

      try {
        const created = await createClickUpTask(title, description, imageBuffer, mimeType);
        console.log(`Task created: ${created.name} (${created.url})`);
        await sock.sendMessage(
          msg.key.remoteJid,
          { text: `✅ [${tagLabel}] dicatat ke ClickUp!\n${created.url}` },
          { quoted: msg }
        );
      } catch (err) {
        console.error('ClickUp error:', err.response?.data || err.message);
      }
    }
  });
}

startBot();
