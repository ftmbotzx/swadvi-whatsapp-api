const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const QRCode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

let sock = null;
let isConnected = false;
let currentQR = null;
let lastQRTime = 0;
let qrBase64 = null;
const messageLog = [];

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys-auth');

  sock = makeWASocket({ auth: state });

  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
    if (qr && Date.now() - lastQRTime > 90000) {
      currentQR = qr;
      qrBase64 = await QRCode.toDataURL(qr);
      lastQRTime = Date.now();
      console.log("📸 New QR code generated.");
    }

    if (connection === 'open') {
      isConnected = true;
      console.log("✅ WhatsApp connected.");
    }

    if (connection === 'close') {
      isConnected = false;
      console.log("❌ WhatsApp disconnected. Reconnecting...");
      setTimeout(connectToWhatsApp, 3000);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      messageLog.push({
        fromMe: msg.key.fromMe,
        number: msg.key.remoteJid,
        text: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[Media]',
        timestamp: Date.now()
      });
    }
  });
}

// ✅ Routes

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

app.get('/qr', async (req, res) => {
  if (!qrBase64) {
    return res.send('<h2>🤖 QR Code is not yet ready. Please wait or refresh in a few seconds.</h2>');
  }
  res.send(`
    <div style="text-align:center;">
      <h2>📲 Scan the QR Code with WhatsApp</h2>
      <img src="${qrBase64}" width="300" /><br/>
      <p><b>QR will refresh every 90 seconds if not scanned.</b></p>
    </div>
  `);
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/chat.html'));
});

// ✅ API Endpoints

app.get('/api/status', (req, res) => {
  res.json({ status: isConnected ? 'connected' : 'disconnected' });
});

app.post('/api/send-text', async (req, res) => {
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp not connected' });

  const { number, message } = req.body;
  const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

  try {
    const sent = await sock.sendMessage(jid, { text: message });
    res.json({ status: 'sent', id: sent.key.id });
  } catch (err) {
    console.error("❌ Message send failed:", err);
    res.status(500).json({ error: 'Send failed' });
  }
});

app.get('/api/contacts', (req, res) => {
  const contacts = [...new Set(messageLog.map(msg => msg.number))];
  res.json({ contacts });
});

app.get('/api/chat/:jid', (req, res) => {
  const jid = req.params.jid;
  const chat = messageLog.filter(m => m.number === jid);
  res.json({ messages: chat });
});

app.get('/api/ftmsecretdev', (req, res) => {
  res.json({ messages: messageLog });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  connectToWhatsApp();
});
