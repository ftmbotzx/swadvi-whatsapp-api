import express from 'express';
import mongoose from 'mongoose';
import { makeWASocket, useSingleFileAuthState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { saveState, getAuthState } from './mongoAuth.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");
    startBot();
  })
  .catch(err => console.error("MongoDB Connection Error", err));

let sock;

async function startBot() {
  const { state, saveCreds } = await getAuthState();

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === 'open') {
      console.log("✅ WhatsApp Connected");
    }
  });
}

app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;
  const jid = number.includes('@s.whatsapp.net') ? number : number + '@s.whatsapp.net';

  try {
    await sock.sendMessage(jid, { text: message });
    res.send({ status: 'success', message: 'Message sent!' });
  } catch (err) {
    res.status(500).send({ status: 'error', error: err.toString() });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
