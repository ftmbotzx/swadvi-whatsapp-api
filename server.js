const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ====== GLOBAL STATE ======
let sock = null;
let isConnected = false;
let currentQR = null;
let qrBase64 = null;
const messageLog = [];

// ====== CONNECT TO WHATSAPP ======
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys-auth');
  sock = makeWASocket({ auth: state });

  sock.ev.on('connection.update', async ({ connection, qr }) => {
    if (qr) {
      currentQR = qr;
      qrBase64 = await QRCode.toDataURL(qr);
      console.log('📸 QR Code updated');
    }

    if (connection === 'open') {
      isConnected = true;
      console.log('✅ WhatsApp connected');
    }

    if (connection === 'close') {
      isConnected = false;
      console.log('❌ WhatsApp disconnected. Reconnecting...');
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

// ====== ROUTES ======
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/chat.html'));
});

app.get('/qr', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/qr.html'));
});

// ✅ QR IMAGE API
app.get('/api/qr', (req, res) => {
  if (!qrBase64) return res.status(503).send('QR not ready');
  const imgBuffer = Buffer.from(qrBase64.split(',')[1], 'base64');
  res.setHeader('Content-Type', 'image/png');
  res.send(imgBuffer);
});

// ✅ STATUS CHECK
app.get('/api/status', (req, res) => {
  res.json({ status: isConnected ? 'connected' : 'disconnected' });
});

// ✅ SEND TEXT MESSAGE
app.post('/api/send-text', async (req, res) => {
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp not connected' });
  const { number, message } = req.body;
  const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

  try {
    const sent = await sock.sendMessage(jid, { text: message });
    res.json({ status: 'sent', id: sent.key.id });
  } catch (err) {
    console.error('❌ Message send failed:', err);
    res.status(500).json({ error: 'Send failed' });
  }
});

// ✅ GET CONTACTS
app.get('/api/contacts', (req, res) => {
  const contacts = [...new Set(messageLog.map(msg => msg.number))];
  res.json({ contacts });
});

// ✅ GET CHAT BY JID
app.get('/api/chat/:jid', (req, res) => {
  const jid = req.params.jid;
  const chat = messageLog.filter(m => m.number === jid);
  res.json({ messages: chat });
});

// ✅ SECRET MESSAGE LOG
app.get('/api/ftmsecretdev', (req, res) => {
  res.json({ messages: messageLog });
});

// ✅ KEEP-ALIVE FOR RENDER
setInterval(() => {
  console.log('🟢 Ping to prevent Render sleeping...');
}, 300000); // every 5 mins

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  connectToWhatsApp();
});
