// 通知の「10分後にもう一度」ボタンが押された時、その分を後ろにずらして再登録する関数
// v2: CORSヘッダーを追加
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
    const { endpoint, title, body } = JSON.parse(event.body);
    if (!endpoint) return { statusCode: 400, headers: CORS_HEADERS, body: 'endpoint is required' };

    const store = getStore({
      name: 'push-subscriptions',
      siteID: process.env.NETLIFY_BLOBS_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
    const key = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
    const raw = await store.get(`reminders_${key}`);
    const reminders = raw ? JSON.parse(raw) : [];
    reminders.push({
      id: 'snooze_' + Date.now(),
      fireAt: new Date(Date.now() + 10 * 60000).toISOString(),
      title: title || 'index',
      body: body || '(スヌーズ)',
    });
    await store.set(`reminders_${key}`, JSON.stringify(reminders));
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
