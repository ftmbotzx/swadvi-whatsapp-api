const express = require('express');
const venom = require('venom-bot');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

venom.create().then(client => {
  console.log('🟢 WhatsApp bot is ready');

  app.post('/send', async (req, res) => {
    const { number, message } = req.body;
    try {
      await client.sendText(number + '@c.us', message);
      res.status(200).send({ success: true, message: 'Message sent ✅' });
    } catch (err) {
      console.error('Failed to send message:', err);
      res.status(500).send({ success: false, error: 'Sending failed' });
    }
  });

  app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
  });
}).catch(e => console.error('Failed to start Venom Bot:', e));