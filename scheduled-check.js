// 15分ごとに自動実行され、「今送るべき通知が無いか」を全員分チェックして送る関数
// v3: Netlifyのログ機能が不調なため、レスポンス自体に詳しい状況を返すデバッグ版
const webpush = require('web-push');
const { getStore } = require('@netlify/blobs');

const ABSENCE_MILESTONES_DAYS = [1, 5, 30, 60, 90, 365];

exports.handler = async () => {
  const debug = { subscribers: 0, details: [] };
  try {
    const store = getStore({
      name: 'push-subscriptions',
      siteID: process.env.NETLIFY_BLOBS_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
    webpush.setVapidDetails(
      'mailto:example@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const { blobs } = await store.list({ prefix: 'sub_' });
    if (!blobs || blobs.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ result: 'no subscribers found', debug }) };
    }
    debug.subscribers = blobs.length;

    const now = new Date();
    const jstHour = (now.getUTCHours() + 9) % 24;
    const todayKeyJST = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    for (const b of blobs) {
      const key = b.key.replace('sub_', '');
      const entry = { key, sent: 0, errors: [] };
      let subscription;
      try {
        subscription = JSON.parse(await store.get(b.key));
      } catch (e) {
        entry.errors.push('subscription parse failed: ' + e.message);
        debug.details.push(entry);
        continue;
      }

      let prefs = { reminder: true, morning: true, absence: true, overdue: true };
      try {
        const prefsRaw = await store.get(`prefs_${key}`);
        if (prefsRaw) prefs = JSON.parse(prefsRaw);
      } catch (e) {}
      entry.prefs = prefs;

      async function send(title, body, extra) {
        try {
          await webpush.sendNotification(subscription, JSON.stringify({ title, body, ...extra }));
          entry.sent++;
        } catch (e) {
          entry.errors.push(`send failed (${e.statusCode || '?'}): ${e.message}`);
          if (e.statusCode === 404 || e.statusCode === 410) await store.delete(b.key);
        }
      }

      // 時間指定のリマインド + やり忘れ再通知
      if (prefs.reminder) {
        try {
          const raw = await store.get(`reminders_${key}`);
          entry.remindersRaw = raw || '(none)';
          if (raw) {
            const reminders = JSON.parse(raw);
            entry.remindersCount = reminders.length;
            entry.nowISO = now.toISOString();
            const stillPending = [];
            const awaitingOverdueRaw = await store.get(`overdue_wait_${key}`).catch(() => null);
            let awaitingOverdue = awaitingOverdueRaw ? JSON.parse(awaitingOverdueRaw) : [];

            for (const r of reminders) {
              const due = new Date(r.fireAt).getTime() <= now.getTime();
              if (due) {
                await send(r.title || 'index', r.body || '', { type: 'reminder', eventId: r.eventId, reminderPayload: r });
                if (r.overdueEnabled && prefs.overdue && r.overdueCheckAt) {
                  awaitingOverdue.push({ eventId: r.eventId, text: r.body, checkAt: r.overdueCheckAt });
                }
              } else {
                stillPending.push(r);
              }
            }
            if (stillPending.length !== reminders.length) {
              await store.set(`reminders_${key}`, JSON.stringify(stillPending));
            }

            const stillAwaiting = [];
            for (const item of awaitingOverdue) {
              if (new Date(item.checkAt).getTime() <= now.getTime()) {
                await send('index', `🔁 ${item.text.replace(/^⏰🔴? ?/, '')} まだ終わっていなければ、そろそろどうでしょう。`);
              } else {
                stillAwaiting.push(item);
              }
            }
            await store.set(`overdue_wait_${key}`, JSON.stringify(stillAwaiting));
          }
        } catch (e) {
          entry.errors.push('reminder block failed: ' + e.message);
        }
      }

      // 朝の挨拶
      if (prefs.morning) {
        try {
          if (jstHour === 6) {
            const morningRaw = await store.get(`morning_${key}`).catch(() => null);
            const morningInfo = morningRaw ? JSON.parse(morningRaw) : {};
            if (morningInfo.lastSentDate !== todayKeyJST) {
              await send('☀️ おはようございます', '今日も、少しずつ進めていきましょう。');
              await store.set(`morning_${key}`, JSON.stringify({ lastSentDate: todayKeyJST }));
            }
          }
        } catch (e) {
          entry.errors.push('morning block failed: ' + e.message);
        }
      }

      // 休眠復帰通知
      if (prefs.absence) {
        try {
          const lastSeenRaw = await store.get(`lastseen_${key}`).catch(() => null);
          if (lastSeenRaw) {
            const { lastSeenAt } = JSON.parse(lastSeenRaw);
            const daysSince = Math.floor((now.getTime() - lastSeenAt) / (1000 * 60 * 60 * 24));
            const milestoneRaw = await store.get(`absence_milestone_${key}`).catch(() => null);
            const notifiedMilestones = milestoneRaw ? JSON.parse(milestoneRaw) : [];
            for (const m of ABSENCE_MILESTONES_DAYS) {
              if (daysSince >= m && !notifiedMilestones.includes(m)) {
                await send('index', `${m}日間、開いていないようです。少しだけ覗いてみませんか？`);
                notifiedMilestones.push(m);
              }
            }
            await store.set(`absence_milestone_${key}`, JSON.stringify(notifiedMilestones));
          }
        } catch (e) {
          entry.errors.push('absence block failed: ' + e.message);
        }
      }

      debug.details.push(entry);
    }

    return { statusCode: 200, body: JSON.stringify({ result: 'checked', debug }, null, 2) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ result: 'top-level error', message: err.message, debug }) };
  }
};

exports.config = {
  schedule: '* * * * *',
};
