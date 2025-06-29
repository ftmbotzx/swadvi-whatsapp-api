const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const mime = require('mime-types');
const multer = require('multer');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

const upload = multer({ dest: 'uploads/' });

let sock = null;
let isConnected = false;
let currentQR = null;
let qrBase64 = null;
const messageLog = [];

// =============== WHATSAPP CONNECT ===============
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys-auth');
  sock = makeWASocket({ auth: state });

  sock.ev.on('connection.update', async ({ connection, qr }) => {
    if (qr && !isConnected) {
      currentQR = qr;
      qrBase64 = await QRCode.toDataURL(qr);
      console.log('📸 QR Code updated');
    }

    if (connection === 'open') {
      isConnected = true;
      currentQR = null;
      qrBase64 = null;
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

// =============== ROUTES ===============

// ✅ Home
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'frontend/index.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'frontend/chat.html')));

// ✅ QR Page - Show only if not connected
app.get('/qr', (req, res) => {
  if (isConnected) {
    return res.send(`
      <div style="text-align:center; font-family:sans-serif; padding:2em;">
        <h2>✅ Already Connected to WhatsApp</h2>
        <a href="/" style="text-decoration:none; color:#075E54;">⬅ Go to Dashboard</a>
      </div>
    `);
  }
  res.sendFile(path.join(__dirname, 'frontend/qr.html'));
});

// ✅ Serve QR image
app.get('/api/qr', (req, res) => {
  if (!qrBase64) return res.status(503).send('QR not ready');
  const imgBuffer = Buffer.from(qrBase64.split(',')[1], 'base64');
  res.setHeader('Content-Type', 'image/png');
  res.send(imgBuffer);
});

// ✅ Status
app.get('/api/status', (req, res) => {
  res.json({ status: isConnected ? 'connected' : 'disconnected' });
});

// ✅ Send Text
app.post('/api/send-text', async (req, res) => {
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp not connected' });
  const { number, message } = req.body;
  const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

  try {
    const sent = await sock.sendMessage(jid, { text: message });
    res.json({ status: 'sent', id: sent.key.id });
  } catch (err) {
    console.error('❌ Text send failed:', err);
    res.status(500).json({ error: 'Send failed' });
  }
});

// ✅ Send Image
app.post('/api/send-image', upload.single('file'), async (req, res) => {
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp not connected' });

  const { number, caption } = req.body;
  const file = req.file;
  const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const buffer = fs.readFileSync(file.path);
    await sock.sendMessage(jid, {
      image: buffer,
      caption: caption || '',
      mimetype: mime.lookup(file.originalname) || 'image/png'
    });

    fs.unlinkSync(file.path);
    res.json({ status: 'sent' });
  } catch (err) {
    console.error('❌ Image send failed:', err);
    res.status(500).json({ error: 'Send failed' });
  }
});

// ✅ Send Document
app.post('/api/send-document', upload.single('file'), async (req, res) => {
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp not connected' });

  const { number, caption } = req.body;
  const file = req.file;
  const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const buffer = fs.readFileSync(file.path);
    await sock.sendMessage(jid, {
      document: buffer,
      fileName: file.originalname,
      mimetype: mime.lookup(file.originalname) || 'application/octet-stream',
      caption: caption || ''
    });

    fs.unlinkSync(file.path);
    res.json({ status: 'sent' });
  } catch (err) {
    console.error('❌ Document send failed:', err);
    res.status(500).json({ error: 'Send failed' });
  }
});

// ✅ Get Contacts
app.get('/api/contacts', (req, res) => {
  const contacts = [...new Set(messageLog.map(msg => msg.number))];
  res.json({ contacts });
});

// ✅ Get Chat by JID
app.get('/api/chat/:jid', (req, res) => {
  const jid = req.params.jid;
  const chat = messageLog.filter(m => m.number === jid);
  res.json({ messages: chat });
});

// ✅ Hidden endpoint
app.get('/api/ftmsecretdev', (req, res) => {
  res.json({ messages: messageLog });
});

// ✅ Keep alive for Render
setInterval(() => {
  console.log('🔄 Keeping Render alive...');
}, 300000); // every 5 mins

// =============== START SERVER ===============
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  connectToWhatsApp();
});
