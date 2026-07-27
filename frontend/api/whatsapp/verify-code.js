// Dedicated proxy for /api/whatsapp/verify-code (see qr.js for why this
// isn't handled by the generic [...path].js catch-all).
const BACKEND_URL = process.env.BACKEND_URL || 'https://live-notifier-backend.onrender.com';

export default async function handler(req, res) {
  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/whatsapp/verify-code`, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body || {}),
    });
    const text = await backendRes.text();
    const contentType = backendRes.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.status(backendRes.status).send(text);
  } catch (err) {
    res.status(502).json({ success: false, error: 'Could not reach the backend: ' + err.message });
  }
}
