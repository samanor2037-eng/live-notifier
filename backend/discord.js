// Sends notifications via a Discord incoming webhook — free and unlimited,
// no bot/app registration needed. Each user creates their own webhook URL
// from a Discord server they control (Server Settings -> Integrations ->
// Webhooks) and pastes it into their app settings; we just POST to it.
const fetch = require('node-fetch');

async function sendDiscordMessage(webhookUrl, text) {
  if (!webhookUrl) {
    return { success: false, error: 'Missing Discord webhook URL' };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`Discord webhook send failed (${res.status}):`, detail);
      return { success: false, error: `Discord returned ${res.status}` };
    }
    return { success: true };
  } catch (err) {
    console.error('Discord webhook send error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendDiscordMessage };
