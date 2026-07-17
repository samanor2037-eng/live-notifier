const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("your-supabase") || supabaseKey.includes("your-supabase")) {
  console.warn("WARNING: Supabase URL or Key is not configured yet. Set them in backend/.env file.");
}

const supabase = (supabaseUrl && supabaseKey && !supabaseUrl.includes("your-supabase")) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

// Helper to send email notifications
async function sendEmailNotification(smtp, channel, isLive, videoUrl, isNewVideo) {
  if (!smtp || !smtp.host || !smtp.user || !smtp.pass || !smtp.to_email) {
    console.log("SMTP is not fully configured. Skipping email notification.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: parseInt(smtp.port) || 587,
    secure: parseInt(smtp.port) === 465,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    }
  });

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
    await transporter.sendMail({
      from: `"Social Alert Engine" <${smtp.user}>`,
      to: smtp.to_email,
      subject: subject,
      html: html
    });
    console.log(`Email successfully sent to ${smtp.to_email}`);
  } catch (err) {
    console.error("Nodemailer Error: Failed to send email alert:", err.message);
  }
}

// Scrape YouTube for Live/Video upload status
async function checkYouTube(channelId) {
  let isLive = false;
  let latestVideoUrl = null;
  let success = false;

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
      // Look for indicators that a channel is currently live
      if (html.includes('"isLive":true') || html.includes('"isLiveBroadcast":true')) {
        isLive = true;
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

  return { success, isLive, latestVideoUrl };
}

// Scrape TikTok for Live/Video status
async function checkTikTok(username) {
  let isLive = false;
  let latestVideoUrl = null;
  let success = false;

  try {
    const url = `https://www.tiktok.com/@${username}`;
    const response = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (response.ok) {
      const html = await response.text();
      // Try parsing Universal Rehydration data
      const jsonMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/);
      if (jsonMatch) {
        const rawData = JSON.parse(jsonMatch[1]);
        const userDetail = rawData.__DEFAULT_SCOPE__?.['webapp.user-detail'];
        const userInfo = userDetail?.userInfo;
        
        if (userInfo) {
          success = true;
          isLive = userInfo.user?.rooms?.length > 0 || userInfo.user?.inRoom === true || !!userInfo.user?.roomId;
          
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

  return { success, isLive, latestVideoUrl };
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

    const { data: settingsData } = await supabase.from('settings').select('*');
    const smtpConfig = settingsData?.find(s => s.key === 'smtp_config')?.value;

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

      // Trigger email notifications
      if (liveStatusChanged || newVideoUploaded) {
        if (smtpConfig) {
          await sendEmailNotification(smtpConfig, channel, checkResult.isLive, checkResult.latestVideoUrl, newVideoUploaded);
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
    timestamp: new Date().toISOString()
  });
});

app.post('/api/check', async (req, res) => {
  const result = await checkAllChannels();
  if (result.success) {
    res.json({ success: true, message: "Manual status check completed successfully." });
  } else {
    res.status(500).json({ success: false, error: result.error || "Check failed" });
  }
});

app.post('/api/send-test-email', async (req, res) => {
  const { smtp_config } = req.body;
  if (!smtp_config || !smtp_config.host || !smtp_config.user || !smtp_config.pass || !smtp_config.to_email) {
    return res.status(400).json({ error: "Missing required SMTP configurations" });
  }
  
  try {
    const transporter = nodemailer.createTransport({
      host: smtp_config.host,
      port: parseInt(smtp_config.port) || 587,
      secure: parseInt(smtp_config.port) === 465,
      auth: {
        user: smtp_config.user,
        pass: smtp_config.pass
      }
    });

    await transporter.sendMail({
      from: `"Social Alert Engine" <${smtp_config.user}>`,
      to: smtp_config.to_email,
      subject: "Test Email: Social Live Notifier",
      text: "Congratulations! Your SMTP settings are correctly configured and working.",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #007aff; border-radius: 8px;">
          <h2 style="color: #007aff;">SMTP Connection Verified!</h2>
          <p>This is a test email confirming that your email notification system is working perfectly.</p>
        </div>
      `
    });
    res.json({ success: true, message: "Test email sent successfully!" });
  } catch (err) {
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
    // Run initial check on server start
    checkAllChannels();
    setInterval(checkAllChannels, intervalMs);
  } else {
    console.log("Supabase not configured. Background polling will start once environment variables are set.");
  }
})();

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
