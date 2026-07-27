// Dedicated proxy for /api/whatsapp/qr — the generic [...path].js catch-all
// doesn't reliably match nested multi-segment paths on this project, so this
// route gets its own file, same as the top-level single-segment ones.
const BACKEND_URL = process.env.BACKEND_URL || 'https://live-notifier-backend.onrender.com';

export default async function handler(req, res) {
  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/whatsapp/qr`, { method: req.method });
    const text = await backendRes.text();
    const contentType = backendRes.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.status(backendRes.status).send(text);
  } catch (err) {
    res.status(502).send('Could not reach the backend: ' + err.message);
  }
}
