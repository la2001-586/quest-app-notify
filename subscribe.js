// このアプリを開いた時、通知を受け取る「宛先」を保存しておくための関数
// v3: CORS(異なるサイトからのアクセス許可)ヘッダーを追加。これが無いと、アプリ側のfetchが「Load failed」で失敗する
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
    const subscription = JSON.parse(event.body);
    const store = getStore({
      name: 'push-subscriptions',
      siteID: process.env.NETLIFY_BLOBS_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
    const key = crypto.createHash('sha256').update(subscription.endpoint).digest('hex').slice(0, 16);
    await store.set(`sub_${key}`, JSON.stringify(subscription));
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
