// このアプリを開いた時、通知を受け取る「宛先」を保存しておくための関数
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const subscription = JSON.parse(event.body);
    // 環境が自動でsiteID/tokenを渡してくれない場合があるため、手動でも渡せるようにしておく
    const store = getStore({
      name: 'push-subscriptions',
      siteID: process.env.NETLIFY_BLOBS_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
    // 個人利用なので、宛先は1件だけ保存する(複数端末対応が必要になったら拡張する)
    await store.set('main', JSON.stringify(subscription));
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
