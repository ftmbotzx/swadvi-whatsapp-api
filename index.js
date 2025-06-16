const express = require("express");
const venom = require("venom-bot");
const app = express();

app.use(express.json());

let client;

venom
  .create({ session: "swadvi" })
  .then((c) => {
    client = c;
    console.log("✅ Venom Bot connected.");
  })
  .catch((err) => console.error("❌ Failed to initialize:", err));

// Test endpoint
app.get("/", (req, res) => {
  res.send("🟢 Swadvi WhatsApp API is live!");
});

// WhatsApp send message endpoint
app.post("/send-message", async (req, res) => {
  const { number, message } = req.body;

  try {
    await client.sendText(`${number}@c.us`, message);
    res.json({ status: "sent", to: number });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
