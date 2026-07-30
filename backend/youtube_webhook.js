// YouTube PubSubHubbub (WebSub) integration.
//
// Instead of polling every YouTube channel every few minutes, we subscribe
// each tracked channel's feed with Google's hub. YouTube then POSTs an Atom
// feed entry to our /api/youtube/webhook the moment a video is
// published/updated, so uploads (and the video that appears the instant a
// stream goes live) get picked up near-instantly instead of waiting for the
// next poll cycle.
const crypto = require('crypto');
const xml2js = require('xml2js');
const fetch = require('node-fetch');

const HUB_URL = 'https://pubsubhubbub.appspot.com/subscribe';
// Hub-recommended max; hub may grant less. We re-subscribe well before this
// on a timer in server.js so we never silently fall off the hub's list.
const LEASE_SECONDS = 5 * 24 * 60 * 60; // 5 days

function topicUrl(channelId) {
  return `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
}

function callbackUrl() {
  const base = process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/api/youtube/webhook`;
}

async function sendHubRequest(mode, channelId) {
  const callback = callbackUrl();
  if (!callback) {
    console.log('YouTube webhook: no PUBLIC_BACKEND_URL/RENDER_EXTERNAL_URL configured, skipping hub subscribe.');
    return { success: false, error: 'No public backend URL configured' };
  }

  const params = new URLSearchParams({
    'hub.mode': mode,
    'hub.topic': topicUrl(channelId),
    'hub.callback': callback,
    'hub.verify': 'async',
    'hub.lease_seconds': String(LEASE_SECONDS),
  });
  if (process.env.YOUTUBE_HUB_SECRET) {
    params.set('hub.secret', process.env.YOUTUBE_HUB_SECRET);
  }

  try {
    const res = await fetch(HUB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    // The hub responds 202/204 immediately and verifies the subscription
    // asynchronously with a GET challenge to our callback.
    if (res.status >= 200 && res.status < 300) {
      return { success: true };
    }
    const text = await res.text();
    console.error(`YouTube hub ${mode} for ${channelId} failed: ${res.status} ${text}`);
    return { success: false, error: `Hub returned ${res.status}` };
  } catch (err) {
    console.error(`YouTube hub ${mode} request failed for ${channelId}:`, err.message);
    return { success: false, error: err.message };
  }
}

function subscribeChannel(channelId) {
  return sendHubRequest('subscribe', channelId);
}

function unsubscribeChannel(channelId) {
  return sendHubRequest('unsubscribe', channelId);
}

// Subscribes/renews every distinct YouTube channel currently tracked in the
// channels table. Safe to call repeatedly — re-subscribing just renews the
// lease. Requests are spaced out slightly so we don't burst the hub.
async function subscribeAllYoutubeChannels(supabase) {
  if (!supabase) return;
  if (!callbackUrl()) {
    console.log('YouTube webhook: skipping subscribe-all, no public backend URL configured yet.');
    return;
  }

  const { data: channels, error } = await supabase
    .from('channels')
    .select('identifier')
    .eq('platform', 'youtube');
  if (error) {
    console.error('YouTube webhook: failed to load channels for subscription:', error.message);
    return;
  }

  const uniqueIds = [...new Set((channels || []).map((c) => c.identifier))];
  for (const channelId of uniqueIds) {
    await subscribeChannel(channelId);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (uniqueIds.length > 0) {
    console.log(`YouTube webhook: (re)subscribed ${uniqueIds.length} channel(s) with the PubSubHubbub hub.`);
  }
}

// Verifies the X-Hub-Signature header the hub sends when hub.secret was set
// at subscribe time. rawBody must be the exact bytes received (a Buffer).
function verifySignature(rawBody, signatureHeader) {
  const secret = process.env.YOUTUBE_HUB_SECRET;
  if (!secret) return true; // no secret configured, nothing to verify
  if (!signatureHeader) return false;

  const [algo, providedDigest] = signatureHeader.split('=');
  if (algo !== 'sha1' || !providedDigest) return false;

  const expectedDigest = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const a = Buffer.from(providedDigest, 'hex');
  const b = Buffer.from(expectedDigest, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Parses the Atom feed body the hub POSTs and returns the distinct
// {channelId, videoId} pairs mentioned in it (usually just one).
async function parseNotification(rawBody) {
  const parsed = await xml2js.parseStringPromise(rawBody.toString('utf8'), {
    explicitArray: false,
    tagNameProcessors: [xml2js.processors.stripPrefix],
  });

  const feed = parsed.feed;
  if (!feed || !feed.entry) return [];

  const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
  return entries
    .map((entry) => ({
      channelId: entry.channelId,
      videoId: entry.videoId,
    }))
    .filter((e) => e.channelId && e.videoId);
}

module.exports = {
  subscribeChannel,
  unsubscribeChannel,
  subscribeAllYoutubeChannels,
  verifySignature,
  parseNotification,
};
