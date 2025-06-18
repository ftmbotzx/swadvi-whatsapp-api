const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

const app = express();
const PORT = process.env.PORT || 3000;

let sock = null;
let isConnected = false;

app.use(bodyParser.json()); // Parse JSON body

// Connect to WhatsApp
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys-auth');

  sock = makeWASocket({ auth: state });

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log('📲 Scan this QR Code to log in:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom &&
        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;

      isConnected = false;
      console.log('❌ Disconnected. Reconnecting:', shouldReconnect);

      if (shouldReconnect) {
        connectToWhatsApp();
      } else {
        console.log('🔒 Session expired. Restart the server to scan QR again.');
      }
    }

    if (connection === 'open') {
      isConnected = true;
      console.log('✅ WhatsApp connected!');
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// WhatsApp connection status
app.get('/whatsapp-status', (req, res) => {
  res.json({ status: isConnected ? 'connected' : 'disconnected' });
});

// Send message
app.post('/send-message', async (req, res) => {
  if (!isConnected) {
    return res.status(503).json({ error: 'WhatsApp is not connected' });
  }

  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).json({ error: 'Missing number or message' });
  }

  const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

  try {
    const sent = await sock.sendMessage(jid, { text: message });
    res.json({ status: 'sent', id: sent.key.id });
  } catch (err) {
    console.error('❌ Failed to send message:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🟢 Server running on http://localhost:${PORT}`);
  connectToWhatsApp();
});
