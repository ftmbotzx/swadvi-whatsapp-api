document.getElementById('messageForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const number = document.getElementById('number').value.trim();
  const message = document.getElementById('message').value.trim();
  const status = document.getElementById('status');

  try {
    const res = await fetch('http://localhost:3000/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, message }),
    });

    const data = await res.json();
    status.textContent = data.status === 'sent' ? '✅ Message sent!' : `❌ ${data.error || 'Error'}`;
  } catch (err) {
    status.textContent = '❌ Failed to connect to backend';
    console.error(err);
  }
});
