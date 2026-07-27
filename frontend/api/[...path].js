// Same-origin proxy to the Render backend.
//
// The browser calls /api/* on vn.samanor.dev (same origin as the frontend),
// and this Vercel serverless function forwards the request server-to-server
// to the real backend. This exists because direct browser fetch() calls to
// the Render URL were intermittently timing out (net::ERR_CONNECTION_TIMED_OUT)
// even though the same URL loaded fine via a top-level navigation and the
// backend's own logs showed it healthy — a server-to-server request has none
// of the cross-origin fetch signals a browser sends, so it isn't subject to
// whatever was dropping those requests at the edge.
const BACKEND_URL = process.env.BACKEND_URL || 'https://live-notifier-backend.onrender.com';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

export default async function handler(req, res) {
  const { path, ...restQuery } = req.query;
  const targetPath = Array.isArray(path) ? path.join('/') : (path || '');

  const url = new URL(`${BACKEND_URL}/api/${targetPath}`);
  for (const [key, value] of Object.entries(restQuery)) {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, v));
    } else if (value !== undefined) {
      url.searchParams.append(key, value);
    }
  }

  const init = {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  }

  try {
    const backendRes = await fetch(url.toString(), init);
    const text = await backendRes.text();
    const contentType = backendRes.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.status(backendRes.status).send(text);
  } catch (err) {
    res.status(502).json({ success: false, error: 'Could not reach the backend', detail: err.message });
  }
}
