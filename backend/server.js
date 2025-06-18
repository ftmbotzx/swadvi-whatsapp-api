
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');

const app = express(); // ✅ Declare app before using it
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// ✅ Serve static frontend (make sure ../public/index.html exists)
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ✅ WhatsApp and routes come below...
let sock = null;
let isConnected = false;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys-auth');

  sock = makeWASocket({ auth: state });

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log('📲 Scan QR to login:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom &&
        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;

      isConnected = false;
      console.log('❌ Disconnected. Reconnect:', shouldReconnect);
      if (shouldReconnect) connectToWhatsApp();
    }

    if (connection === 'open') {
      isConnected = true;
      console.log('✅ WhatsApp connected!');
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

app.get('/whatsapp-status', (req, res) => {
  res.json({ status: isConnected ? 'connected' : 'disconnected' });
});

app.post('/send-message', async (req, res) => {
  if (!isConnected) {
    return res.status(503).json({ status: 'disconnected', error: 'WhatsApp not connected' });
  }

  const { number, message } = req.body;
  if (!number || !message) return res.status(400).json({ error: 'Missing number or message' });

  const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

  try {
    const sent = await sock.sendMessage(jid, { text: message });
    res.json({ status: 'sent', id: sent.key.id });
  } catch (err) {
    console.error('❌ Send failed:', err);
    res.status(500).json({ error: 'Send failed' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  connectToWhatsApp();
});
