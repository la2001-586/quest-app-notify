// 保存しておいた宛先に、実際に通知を送るための関数
// 動作確認用: このURLをブラウザで開くだけで、テスト通知が1件届く
const webpush = require('web-push');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  try {
    const store = getStore({
      name: 'push-subscriptions',
      siteID: process.env.NETLIFY_BLOBS_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
    const raw = await store.get('main');
    if (!raw) {
      return { statusCode: 404, body: '宛先がまだ登録されていません。先にアプリで通知を許可してください。' };
    }
    const subscription = JSON.parse(raw);

    webpush.setVapidDetails(
      'mailto:example@example.com', // 後で自分の連絡先メールに置き換えてOK(必須項目だが実際には使われない)
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const title = (event.queryStringParameters && event.queryStringParameters.title) || 'index';
    const body = (event.queryStringParameters && event.queryStringParameters.body) || 'テスト通知です';

    await webpush.sendNotification(subscription, JSON.stringify({ title, body }));
    return { statusCode: 200, body: '通知を送信しました' };
  } catch (err) {
    return { statusCode: 500, body: 'エラー: ' + err.message };
  }
};
