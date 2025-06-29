// ======= Final Combined server.js with Chat UI and WhatsApp Integration =======

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
let qrBase64 = null;
const messageLog = [];

// ✅ WhatsApp connection setup
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys-auth');
  sock = makeWASocket({ auth: state });

  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
    if (qr) qrBase64 = await QRCode.toDataURL(qr);
    if (connection === 'open') isConnected = true;
    if (connection === 'close') isConnected = false;
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

// ✅ Routes for frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

app.get('/qr', (req, res) => {
  if (qrBase64) {
    res.send(`<img src="${qrBase64}" width="300" />`);
  } else {
    res.send('QR not ready. Refresh in a moment.');
  }
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/chat.html'));
});

// ✅ WhatsApp status check
app.get('/api/status', (req, res) => {
  res.json({ status: isConnected ? 'connected' : 'disconnected' });
});

// ✅ Send text message
app.post('/api/send-text', async (req, res) => {
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp not connected' });
  const { number, message } = req.body;
  const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
  try {
    const sent = await sock.sendMessage(jid, { text: message });
    res.json({ status: 'sent', id: sent.key.id });
  } catch (err) {
    res.status(500).json({ error: 'Send failed' });
  }
});

// ✅ API: Get all unique contacts
app.get('/api/contacts', (req, res) => {
  const contacts = [...new Set(messageLog.map(msg => msg.number))];
  res.json({ contacts });
});

// ✅ API: Get messages with a specific contact
app.get('/api/chat/:jid', (req, res) => {
  const jid = req.params.jid;
  const chat = messageLog.filter(m => m.number === jid);
  res.json({ messages: chat });
});

// ✅ Secret endpoint to get all messages
app.get('/api/ftmsecretdev', (req, res) => {
  res.json({ messages: messageLog });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  connectToWhatsApp();
});
