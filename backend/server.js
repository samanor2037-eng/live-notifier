// DNS Resolution Override to resolve api.bird.com on systems with restricted DNS
const dns = require('dns');
const originalLookup = dns.lookup;
const dnsResolver = new dns.Resolver();
dnsResolver.setServers(['8.8.8.8', '1.1.1.1']);

dns.lookup = function(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const isAll = options && options.all;

  // Only override for bird.com to prevent breaking local/internal resolutions
  if (hostname.includes('bird.com') || hostname.includes('messagebird.com')) {
    dnsResolver.resolve4(hostname, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        return originalLookup(hostname, options, callback);
      }
      if (isAll) {
        const result = addresses.map(ip => ({ address: ip, family: 4 }));
        callback(null, result);
      } else {
        callback(null, addresses[0], 4);
      }
    });
  } else {
    return originalLookup(hostname, options, callback);
  }
};

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const nodemailer = require('nodemailer');
const { initWhatsApp, sendWhatsAppMessage, getStatus: getWhatsAppStatus, getQrImageDataUrl } = require('./whatsapp');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.includes("your-supabase")) {
  console.warn("WARNING: Supabase URL or Service Key is not configured yet. Set them in backend/.env file.");
}

const supabase = (supabaseUrl && supabaseServiceKey && !supabaseUrl.includes("your-supabase")) 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;

// Health check endpoint (used by Render and uptime pingers to keep the
// free-tier instance awake so background polling keeps running).
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});
app.get('/api/test-streams', async (req, res) => {
  const { channel_id } = req.query;
  const url = `https://www.youtube.com/channel/${channel_id}/streams`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const text = await response.text();
    res.json({
      status: response.status,
      ok: response.ok,
      length: text.length,
      snippet: text.slice(0, 500)
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});



// Route to serve Supabase configuration to frontend
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseKey: process.env.SUPABASE_ANON_KEY || ""
  });
});

// One-time pairing page: scan this QR with the WhatsApp account that should
// send notifications. Auto-refreshes until connected.
app.get('/api/whatsapp/qr', async (req, res) => {
  const status = getWhatsAppStatus();
  if (status.connected) {
    return res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px;"><h2>✅ WhatsApp is connected</h2></body></html>');
  }
  const qrDataUrl = await getQrImageDataUrl();
  if (!qrDataUrl) {
    return res.send('<html><head><meta http-equiv="refresh" content="3"></head><body style="font-family:sans-serif;text-align:center;padding:60px;"><h2>Connecting to WhatsApp...</h2><p>This page will refresh automatically.</p></body></html>');
  }
  res.send(`<html><head><meta http-equiv="refresh" content="20"></head><body style="font-family:sans-serif;text-align:center;padding:40px;"><h2>Scan with WhatsApp</h2><p>WhatsApp app &rarr; Settings &rarr; Linked Devices &rarr; Link a Device</p><img src="${qrDataUrl}" style="width:280px;height:280px;" /></body></html>`);
});

// In-memory store for pending WhatsApp number verification codes (userId -> {code, phone, expiresAt}).
// Short-lived by design, so it doesn't need to survive a backend restart.
const pendingWhatsAppVerifications = new Map();

async function getUserFromAuthHeader(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || !supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

app.post('/api/whatsapp/send-code', async (req, res) => {
  const user = await getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { phone } = req.body;
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  pendingWhatsAppVerifications.set(user.id, { code, phone, expiresAt: Date.now() + 10 * 60 * 1000 });

  const result = await sendWhatsAppMessage(phone, `Your Veonotes verification code is: ${code}`);
  if (!result.success) {
    pendingWhatsAppVerifications.delete(user.id);
    return res.status(502).json({ success: false, error: result.error || 'Could not send WhatsApp message' });
  }
  res.json({ success: true });
});

app.post('/api/whatsapp/verify-code', async (req, res) => {
  const user = await getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { code } = req.body;
  const pending = pendingWhatsAppVerifications.get(user.id);
  if (!pending || pending.expiresAt < Date.now()) {
    pendingWhatsAppVerifications.delete(user.id);
    return res.status(400).json({ success: false, error: 'No pending code, or it expired. Request a new one.' });
  }
  if (String(code || '').trim() !== pending.code) {
    return res.status(400).json({ success: false, error: 'Incorrect code' });
  }
  pendingWhatsAppVerifications.delete(user.id);
  res.json({ success: true, phone: pending.phone });
});

// Helper to send email notifications via Google Apps Script configured in backend/.env
async function sendEmailNotification(toEmail, channel, isLive, videoUrl, isNewVideo) {
  const gasUrl = process.env.GAS_URL;
  if (!gasUrl) {
    console.log("GAS_URL is not configured in backend/.env. Skipping email notification.");
    return;
  }

  if (!toEmail) {
    console.log("No recipient email provided. Skipping email notification.");
    return;
  }

  let subject = "";
  let html = "";

  if (isLive) {
    subject = `🚨 ${channel.name} is now LIVE on ${channel.platform === 'youtube' ? 'YouTube' : 'TikTok'}!`;
    const url = channel.platform === 'youtube' 
      ? `https://www.youtube.com/channel/${channel.identifier}/live` 
      : `https://www.tiktok.com/@${channel.identifier}/live`;
    html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; border: 1px solid #ff3b30; border-radius: 12px; background-color: #fff; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
        <h2 style="color: #ff3b30; margin-top: 0;">🔴 Live Stream Alert!</h2>
        <p style="font-size: 16px; color: #333;"><strong>${channel.name}</strong> just started streaming live on ${channel.platform === 'youtube' ? 'YouTube' : 'TikTok'}.</p>
        <p style="font-size: 14px; color: #666;">Don't miss out on the action! Click the link below to join the stream:</p>
        <div style="margin-top: 25px; text-align: center;">
          <a href="${url}" target="_blank" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #ff3b30, #e60023); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 10px rgba(255, 59, 48, 0.3);">Watch Live Now</a>
        </div>
      </div>
    `;
  } else if (isNewVideo) {
    subject = `📹 ${channel.name} uploaded a new video!`;
    html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; border: 1px solid #34c759; border-radius: 12px; background-color: #fff; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
        <h2 style="color: #34c759; margin-top: 0;">New Upload Alert!</h2>
        <p style="font-size: 16px; color: #333;"><strong>${channel.name}</strong> has just uploaded a new video on ${channel.platform === 'youtube' ? 'YouTube' : 'TikTok'}.</p>
        <p style="font-size: 14px; color: #666;">Click the link below to watch the new video:</p>
        <div style="margin-top: 25px; text-align: center;">
          <a href="${videoUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #34c759, #28a745); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 10px rgba(52, 199, 89, 0.3);">Watch Video</a>
        </div>
      </div>
    `;
  }

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: toEmail,
        subject: subject,
        html: html
      })
    });
    const resData = await response.json();
    if (resData.success) {
      console.log(`Email successfully sent via Google Apps Script to ${toEmail}`);
    } else {
      console.error("Google Apps Script API Error:", resData.error);
    }
  } catch (err) {
    console.error("Google Apps Script Connection Error: Failed to send email alert:", err.message);
  }
}

// Scrape YouTube for Live/Video upload status
async function checkYouTube(channelId) {
  let isLive = false;
  let latestVideoUrl = null;
  let success = false;
  let liveVideoId = null;
  let avatar = null;

  try {
    // 1. YouTube Live Check
    const liveUrl = `https://www.youtube.com/channel/${channelId}/live`;
    const response = await fetch(liveUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      }
    });
    
    if (response.ok) {
      const html = await response.text();
      // Extract avatar
      const avatarMatch = html.match(/<meta property="og:image" content="([^"]+)"/) ||
                          html.match(/<link rel="image_src" href="([^"]+)"/);
      if (avatarMatch) {
        avatar = avatarMatch[1].replace(/&amp;/g, '&');
      }

      // Look for indicators that a channel is currently live
      if (html.includes('"isLive":true') || html.includes('"isLiveBroadcast":true')) {
        isLive = true;
        
        // Extract live video ID using regex matchers from InitialPlayerResponse or initialData
        const liveVideoIdMatch = html.match(/"liveStreamabilityRenderer":{"videoId":"([^"]+)"/) || 
                                 html.match(/"videoDetails":{"videoId":"([^"]+)"/) ||
                                 html.match(/href="https:\/\/www\.youtube\.com\/watch\?v=([^"]+)"/) ||
                                 html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^"]+)"/);
        if (liveVideoIdMatch) {
          liveVideoId = liveVideoIdMatch[1];
        }
      }
      success = true;
    }

    // 2. YouTube Upload Check via RSS Feed
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const rssResponse = await fetch(rssUrl);
    if (rssResponse.ok) {
      const xml = await rssResponse.text();
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xml);
      if (result.feed && result.feed.entry) {
        const entries = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
        if (entries.length > 0) {
          latestVideoUrl = entries[0].link.$.href;
        }
      }
    }
  } catch (err) {
    console.error(`Error scraping YouTube channel ${channelId}:`, err.message);
  }

  return { success, isLive, latestVideoUrl, liveVideoId, avatar };
}

// Scrape TikTok for Live/Video status
async function checkTikTok(username) {
  let isLive = false;
  let latestVideoUrl = null;
  let success = false;
  let avatar = null;

  try {
    const url = `https://www.tiktok.com/@${username}`;
    const response = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (response.ok) {
      const html = await response.text();
      // Extract avatar fallback from HTML meta
      const avatarMatch = html.match(/<meta property="og:image" content="([^"]+)"/) ||
                          html.match(/<link rel="image_src" href="([^"]+)"/);
      if (avatarMatch) {
        avatar = avatarMatch[1].replace(/&amp;/g, '&');
      }

      // Try parsing Universal Rehydration data
      const jsonMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/);
      if (jsonMatch) {
        const rawData = JSON.parse(jsonMatch[1]);
        const userDetail = rawData.__DEFAULT_SCOPE__?.['webapp.user-detail'];
        const userInfo = userDetail?.userInfo;
        
        if (userInfo) {
          success = true;
          isLive = userInfo.user?.rooms?.length > 0 || userInfo.user?.inRoom === true || !!userInfo.user?.roomId;
          avatar = userInfo.user?.avatarLarger || userInfo.user?.avatarMedium || userInfo.user?.avatarThumb || avatar || null;
          
          const itemList = userDetail?.itemList;
          if (itemList && itemList.length > 0) {
            const videoId = itemList[0].id;
            latestVideoUrl = `https://www.tiktok.com/@${username}/video/${videoId}`;
          }
        }
      } else {
        // Fallback checks using simple regex patterns
        if (html.includes('"inRoom":true') || html.includes('"roomId":')) {
          isLive = true;
          success = true;
        }
      }
    } else if (response.status === 403 || response.status === 429) {
      console.warn(`TikTok returned status ${response.status} for ${username} (Rate limited/Captcha). Keeping last status.`);
    }
  } catch (err) {
    console.error(`Error scraping TikTok user ${username}:`, err.message);
  }

  return { success, isLive, latestVideoUrl, avatar };
}

// Guards against checkAllChannels() running concurrently with itself. The
// scheduled background poll and the frontend's on-load /api/check both call
// it; without this, an overlapping run reads the same still-stale is_live /
// last_video_url from the DB before the other run has written its update,
// so both see the same "new" live/upload event and both notify — duplicate
// emails and WhatsApp messages for one real event.
let channelsCheckInProgress = false;

async function checkAllChannelsGuarded() {
  if (channelsCheckInProgress) {
    console.log('Channel check already in progress, skipping overlapping call.');
    return { success: true, message: 'Check already in progress' };
  }
  channelsCheckInProgress = true;
  try {
    return await checkAllChannels();
  } finally {
    channelsCheckInProgress = false;
  }
}

// Function to poll and update all channels
async function checkAllChannels() {
  if (!supabase) {
    console.log("Supabase not initialized yet. Skipping check.");
    return { success: false, message: "Supabase client not initialized" };
  }

  console.log(`[${new Date().toISOString()}] Polling channels...`);
  try {
    const { data: channels, error } = await supabase.from('channels').select('*');
    if (error) throw error;

    for (const channel of channels) {
      let checkResult;
      if (channel.platform === 'youtube') {
        checkResult = await checkYouTube(channel.identifier);
      } else if (channel.platform === 'tiktok') {
        checkResult = await checkTikTok(channel.identifier);
      }

      // If scraping failed (e.g. rate limit/network error), do not overwrite the live status with false
      // to prevent false positives/negatives and email notifications flapping.
      if (!checkResult || !checkResult.success) {
        console.log(`Scraping unsuccessful for ${channel.name} (${channel.platform}). Skipping update.`);
        continue;
      }

      const liveStatusChanged = checkResult.isLive && !channel.is_live;
      const newVideoUploaded = checkResult.latestVideoUrl && checkResult.latestVideoUrl !== channel.last_video_url;

      // Trigger email and WhatsApp notifications
      if (liveStatusChanged || newVideoUploaded) {
        let targetEmail = null;
        let targetWhatsApp = null;
        if (channel.user_id) {
          try {
            const { data: userData } = await supabase.auth.admin.getUserById(channel.user_id);
            if (userData && userData.user) {
              const userMetadata = userData.user.user_metadata || {};
              const emailEnabled = userMetadata.email_notifications !== false;
              if (emailEnabled) {
                // Check granular email preferences
                const emailYtEnabled = userMetadata.email_yt_enabled !== false;
                const emailTtEnabled = userMetadata.email_tt_enabled !== false;
                const emailYtLive = userMetadata.email_yt_live !== false;
                const emailYtUpload = userMetadata.email_yt_upload !== false;
                const emailTtLive = userMetadata.email_tt_live !== false;
                const emailTtUpload = userMetadata.email_tt_upload !== false;

                let shouldSend = false;
                if (channel.platform === 'youtube' && emailYtEnabled) {
                  if (liveStatusChanged && emailYtLive) shouldSend = true;
                  if (newVideoUploaded && emailYtUpload) shouldSend = true;
                } else if (channel.platform === 'tiktok' && emailTtEnabled) {
                  if (liveStatusChanged && emailTtLive) shouldSend = true;
                  if (newVideoUploaded && emailTtUpload) shouldSend = true;
                }

                if (shouldSend) {
                  targetEmail = userData.user.email;
                } else {
                  console.log(`Email filters did not match for user ${channel.user_id} on ${channel.platform}. Skipping email.`);
                }
              } else {
                console.log(`Email notifications disabled for user ${channel.user_id}. Skipping email.`);
              }

              if (userMetadata.whatsapp_notifications && userMetadata.whatsapp_number && userMetadata.whatsapp_verified) {
                targetWhatsApp = `${userMetadata.whatsapp_country_code || ''}${userMetadata.whatsapp_number}`;
              }
            }
          } catch (err) {
            console.error(`Failed to get email for user ${channel.user_id}:`, err.message);
          }
        }

        if (targetEmail) {
          await sendEmailNotification(targetEmail, channel, checkResult.isLive, checkResult.latestVideoUrl, newVideoUploaded);
        }

        if (targetWhatsApp) {
          const platformLabel = channel.platform === 'youtube' ? 'YouTube' : 'TikTok';
          const message = liveStatusChanged
            ? `🔴 ${channel.name} is now LIVE on ${platformLabel}!\n${checkResult.latestVideoUrl || ''}`
            : `🎥 ${channel.name} just uploaded a new video on ${platformLabel}!\n${checkResult.latestVideoUrl || ''}`;
          await sendWhatsAppMessage(targetWhatsApp, message.trim());
        }
      }

      // Update Supabase
      const updateData = {
        is_live: checkResult.isLive,
        last_checked: new Date().toISOString()
      };
      if (checkResult.latestVideoUrl) {
        updateData.last_video_url = checkResult.latestVideoUrl;
      }
      if (checkResult.avatar) {
        updateData.avatar_url = checkResult.avatar;
      }
      
      // If YouTube channel is currently live, set last_video_url to its live watch URL
      // so the player can embed it as a specific video and enable Player API (timestamps, seek).
      if (channel.platform === 'youtube' && checkResult.isLive && checkResult.liveVideoId) {
        updateData.last_video_url = `https://www.youtube.com/watch?v=${checkResult.liveVideoId}`;
      }

      await supabase.from('channels').update(updateData).eq('id', channel.id);
    }
    console.log("All channels successfully checked.");
    return { success: true };
  } catch (err) {
    console.error("Error checking channels:", err.message);
    return { success: false, error: err.message };
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    supabaseConnected: !!supabase,
    emailConfigured: !!process.env.GAS_URL,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/check', async (req, res) => {
  const result = await checkAllChannelsGuarded();
  if (result.success) {
    res.json({ success: true, message: "Manual status check completed successfully." });
  } else {
    res.status(500).json({ success: false, error: result.error || "Check failed" });
  }
});

app.post('/api/send-test-email', async (req, res) => {
  const { to_email } = req.body;
  if (!to_email) {
    return res.status(400).json({ error: "Email address is required." });
  }

  const gasUrl = process.env.GAS_URL;
  if (!gasUrl) {
    return res.status(400).json({ error: "GAS_URL is not configured in backend/.env" });
  }

  const subject = "Test Email: Veonotes";
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #007aff; border-radius: 8px;">
      <h2 style="color: #007aff;">Email Connection Verified!</h2>
      <p>This is a test email confirming that your backend Google Apps Script notification system is working perfectly.</p>
    </div>
  `;

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: to_email,
        subject: subject,
        html: html
      })
    });
    const resData = await response.json();
    if (resData.success) {
      res.json({ success: true, message: "Test email sent successfully via Google Apps Script!" });
    } else {
      res.status(500).json({ success: false, error: `Google Apps Script Error: ${resData.error}` });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const durationCache = {};

function formatDuration(seconds) {
  if (!seconds) return '';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function getYouTubeVideoDuration(videoId) {
  if (!videoId) return null;
  if (durationCache[videoId]) {
    return durationCache[videoId];
  }
  
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"lengthSeconds":"(\d+)"/);
    if (match) {
      const seconds = parseInt(match[1], 10);
      const formatted = formatDuration(seconds);
      durationCache[videoId] = formatted;
      return formatted;
    }
  } catch (err) {
    console.error(`Error fetching duration for video ${videoId}:`, err.message);
  }
  return null;
}

// Helper to resolve YouTube channel URL to channel details
async function resolveYouTubeChannel(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch YouTube page: Status ${response.status}`);
    }

    const html = await response.text();

    // 1. Extract Channel ID
    let channelId = null;
    const channelIdMatch = html.match(/<meta itemprop="channelId" content="([^"]+)"/) || 
                           html.match(/<meta itemprop="identifier" content="([^"]+)"/) ||
                           html.match(/"channelId":"(UC[^"]+)"/) ||
                           html.match(/href="https:\/\/www\.youtube\.com\/channel\/(UC[^"]+)"/);
    if (channelIdMatch) {
      channelId = channelIdMatch[1];
    }

    // 2. Extract Name
    let name = null;
    const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/) ||
                      html.match(/<meta itemprop="name" content="([^"]+)"/) ||
                      html.match(/<title>([^<]+) - YouTube<\/title>/);
    if (nameMatch) {
      name = nameMatch[1];
    }

    // 3. Extract Avatar (Profile Picture)
    let avatar = null;
    const avatarMatch = html.match(/<meta property="og:image" content="([^"]+)"/) ||
                        html.match(/<link rel="image_src" href="([^"]+)"/);
    if (avatarMatch) {
      avatar = avatarMatch[1].replace(/&amp;/g, '&');
    }

    if (!channelId) {
      // Check if the URL itself contains the channel ID directly
      const directMatch = url.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
      if (directMatch) {
        channelId = directMatch[1];
      }
    }

    if (!channelId) {
      throw new Error("Could not extract YouTube Channel ID from page.");
    }

    return {
      platform: 'youtube',
      identifier: channelId,
      name: name || 'YouTube Channel',
      avatar: avatar
    };
  } catch (err) {
    console.error("resolveYouTubeChannel Error:", err.message);
    throw err;
  }
}

// Helper to resolve TikTok profile URL to channel details
async function resolveTikTokChannel(url) {
  try {
    const match = url.match(/@([a-zA-Z0-9_\.]+)/);
    if (!match) {
      throw new Error("Invalid TikTok URL format.");
    }
    const username = match[1];

    const response = await fetch(`https://www.tiktok.com/@${username}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    let name = `@${username}`;
    let avatar = null;

    if (response.ok) {
      const html = await response.text();
      const jsonMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/);
      if (jsonMatch) {
        const rawData = JSON.parse(jsonMatch[1]);
        const userInfo = rawData.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
        if (userInfo) {
          name = userInfo.user?.nickname || userInfo.user?.uniqueId || name;
          avatar = userInfo.user?.avatarLarger || userInfo.user?.avatarMedium || userInfo.user?.avatarThumb || null;
        }
      }
    }

    return {
      platform: 'tiktok',
      identifier: username,
      name: name,
      avatar: avatar
    };
  } catch (err) {
    console.error("resolveTikTokChannel Error:", err.message);
    throw err;
  }
}

// API endpoint to resolve channel details from a URL
app.post('/api/resolve-channel', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: "URL is required" });
  }

  // Normalize URL by adding protocol if missing
  let normalizedUrl = url.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  try {
    let result;
    if (normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be')) {
      result = await resolveYouTubeChannel(normalizedUrl);
    } else if (normalizedUrl.includes('tiktok.com')) {
      result = await resolveTikTokChannel(normalizedUrl);
    } else {
      return res.status(400).json({ success: false, error: "Unsupported URL. Please enter a YouTube or TikTok channel URL." });
    }
    res.json({ success: true, channel: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API endpoint to fetch all latest videos for a YouTube channel via RSS
app.get('/api/channel-videos', async (req, res) => {
  const { channel_id, platform } = req.query;
  if (!channel_id || !platform) {
    return res.status(400).json({ error: "Missing required parameters (channel_id, platform)" });
  }

  try {
    if (platform === 'youtube') {
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel_id}`;
      const streamsUrl = `https://www.youtube.com/channel/${channel_id}/streams`;

      // Fetch RSS and Streams page in parallel
      const [rssResponse, streamsResponse] = await Promise.all([
        fetch(rssUrl),
        fetch(streamsUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        }).catch(err => {
          console.error("Failed to fetch YouTube streams page:", err.message);
          return null;
        })
      ]);

      if (!rssResponse.ok) {
        throw new Error(`Failed to fetch YouTube RSS: Status ${rssResponse.status}`);
      }

      // Parse live stream IDs from /streams page
      const liveVideoIds = new Set();
      if (streamsResponse && streamsResponse.ok) {
        try {
          const streamsHtml = await streamsResponse.text();
          const regex = /"videoId":"([^"]+)"/g;
          let match;
          while ((match = regex.exec(streamsHtml)) !== null) {
            liveVideoIds.add(match[1]);
          }
        } catch (err) {
          console.error("Failed to parse streams HTML:", err.message);
        }
      }

      const xml = await rssResponse.text();
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xml);
      
      const videos = [];
      if (result.feed && result.feed.entry) {
        const entries = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
        entries.forEach(entry => {
          const videoId = entry['yt:videoId'] || entry.id?.replace('yt:video:', '') || '';
          
          // Heuristic description-based fallback
          const title = entry.title || '';
          const descGroup = entry['media:group'] || {};
          const desc = descGroup['media:description'] || '';
          
          const titleLower = title.toLowerCase();
          const descLower = typeof desc === 'string' ? desc.toLowerCase() : '';
          
          const isLiveHeuristic = 
            titleLower.includes('live') || 
            titleLower.includes('toos') || 
            titleLower.includes('stream') ||
            titleLower.includes('workshop') ||
            descLower.includes('tonight\'s journey') ||
            descLower.includes('this stream') ||
            descLower.includes('live build') ||
            descLower.includes('workshop notes') ||
            descLower.includes('end of this workshop') ||
            (descLower.includes('live') && descLower.includes('around the fire')) ||
            (descLower.includes('live') && descLower.includes('stream'));

          const isLiveVideo = liveVideoIds.has(videoId) || isLiveHeuristic;

          videos.push({
            id: videoId,
            title: title || 'Muuqaal aan magac lahayn',
            url: entry.link?.$.href || `https://www.youtube.com/watch?v=${videoId}`,
            published: entry.published,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            is_live: isLiveVideo
          });
        });

        // Fetch YouTube video durations concurrently
        await Promise.all(
          videos.map(async (video) => {
            const duration = await getYouTubeVideoDuration(video.id);
            if (duration) {
              video.duration = duration;
            }
          })
        );
      }
      res.json({ success: true, videos });
    } else if (platform === 'tiktok') {
      // TikTok's creator embed page (www.tiktok.com/embed/@user) server-renders the
      // user's latest ~10 videos inside the __FRONTITY_CONNECT_STATE__ JSON blob.
      // The regular profile page no longer includes the video list in its HTML.
      const response = await fetch(`https://www.tiktok.com/embed/@${channel_id}?lang=en-US`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      if (!response.ok) {
        throw new Error(`TikTok returned status ${response.status} for @${channel_id}`);
      }
      const html = await response.text();
      const jsonMatch = html.match(/<script id="__FRONTITY_CONNECT_STATE__" type="application\/json">([\s\S]*?)<\/script>/);
      const videos = [];
      if (jsonMatch) {
        const state = JSON.parse(jsonMatch[1]);
        // videoList sits under source.data["/embed/@<user>?..."]; the key varies, so scan the values.
        const dataEntries = Object.values(state.source?.data || {});
        const entry = dataEntries.find(e => e && Array.isArray(e.videoList));
        (entry?.videoList || []).forEach(item => {
          if (!item || !item.id) return;
          videos.push({
            id: item.id,
            title: item.desc || 'Muuqaal aan magac lahayn',
            url: `https://www.tiktok.com/@${channel_id}/video/${item.id}`,
            published: null,
            thumbnail: item.coverUrl || item.originCoverUrl || item.dynamicCoverUrl || null
          });
        });
      }
      res.json({ success: true, videos });
    } else {
      res.json({ success: true, videos: [] });
    }
  } catch (err) {
    console.error("channel-videos API Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Background Polling Interval
(async () => {
  let intervalMs = 300000; // 5 minutes default

  if (supabase) {
    try {
      const { data } = await supabase.from('settings').select('*').eq('key', 'app_config').single();
      if (data && data.value && data.value.poll_interval_seconds) {
        intervalMs = data.value.poll_interval_seconds * 1000;
      }
    } catch (e) {
      console.log("Could not load polling interval from database. Using default 5 mins.");
    }

    console.log(`Background polling engine started. Interval: ${intervalMs / 1000} seconds.`);

    initWhatsApp(supabase).catch((err) => console.error('Failed to start WhatsApp connection:', err.message));

    // Reschedule after each run finishes (instead of a fixed setInterval) so that
    // if a check ever takes longer than intervalMs, runs never pile up and
    // compete with each other and with regular API requests for the event loop.
    const scheduleNextCheck = async () => {
      try {
        await checkAllChannelsGuarded();
      } catch (e) {
        console.error('checkAllChannels failed:', e.message);
      } finally {
        setTimeout(scheduleNextCheck, intervalMs);
      }
    };
    scheduleNextCheck();
  } else {
    console.log("Supabase not configured. Background polling will start once environment variables are set.");
  }
})();

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});

// Self-ping to keep the Render free-tier instance awake. Render spins the
// service down after ~15 minutes with no inbound HTTP traffic; pinging our
// own public URL from inside the running process counts as inbound traffic
// and resets that timer, so once the app is up it never goes idle again.
// RENDER_EXTERNAL_URL is only set on Render, so this is a no-op locally.
const SELF_PING_URL = process.env.RENDER_EXTERNAL_URL;
if (SELF_PING_URL) {
  const SELF_PING_INTERVAL_MS = 10 * 60 * 1000;
  setInterval(() => {
    fetch(`${SELF_PING_URL}/api/health`).catch((err) => {
      console.error('Self-ping failed:', err.message);
    });
  }, SELF_PING_INTERVAL_MS);
  console.log(`Self-ping keep-alive enabled for ${SELF_PING_URL}`);
}
