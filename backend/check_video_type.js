const fetch = require('node-fetch');
const xml2js = require('xml2js');

async function test() {
  const channel_id = 'UCT9ggCOh13bSlESCVWt192w';
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel_id}`;
  const response = await fetch(rssUrl);
  const xml = await response.text();
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(xml);
  
  const entries = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
  const target = entries.find(e => {
    const vId = e['yt:videoId'] || e.id?.replace('yt:video:', '') || '';
    return vId === '7dF4hQEcJbs';
  });
  console.log(JSON.stringify(target, null, 2));
}

test().catch(console.error);
