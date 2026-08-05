// アプリ側から、その時点で持っている「あとで通知してほしい予定リスト」と、通知の種類ごとの設定を丸ごと送ってもらい、保存する関数
// v3: CORSヘッダーを追加
const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }
  try {
    const body = JSON.parse(event.body);
    const { endpoint, reminders, prefs } = body;
    if (!endpoint) return { statusCode: 400, headers: CORS_HEADERS, body: 'endpoint is required' };

    const store = getStore({
      name: 'push-subscriptions',
      siteID: process.env.NETLIFY_BLOBS_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
    const key = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
    await store.set(`reminders_${key}`, JSON.stringify(reminders || []));
    if (prefs) await store.set(`prefs_${key}`, JSON.stringify(prefs));
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
