// Sends notifications via the Telegram Bot API — free and unlimited, unlike
// WhatsApp which needs a personal account paired through Baileys.
// Requires TELEGRAM_BOT_TOKEN (one bot for the whole app, created once via
// @BotFather); each user supplies their own chat ID, obtained by messaging
// their bot and reading the chat ID off @userinfobot or the bot's getUpdates.
const fetch = require('node-fetch');

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('Telegram: TELEGRAM_BOT_TOKEN not configured, skipping message.');
    return { success: false, error: 'Telegram bot token not configured' };
  }
  if (!chatId) {
    return { success: false, error: 'Missing Telegram chat ID' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`Telegram send failed for chat ${chatId}:`, data.description);
      return { success: false, error: data.description };
    }
    return { success: true };
  } catch (err) {
    console.error(`Telegram send error for chat ${chatId}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendTelegramMessage };
