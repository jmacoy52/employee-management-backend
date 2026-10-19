// In-app fallback for the daily billing job, so no Render cron service is needed.
// Every 30 minutes the web service checks whether today's run (UTC) has happened; from 06:00 UTC it runs
// services/billingDaily.runDaily once. runDaily holds a MySQL named lock, so with several instances (or a
// cron service as well) only one runs at a time, and every step is idempotent, so a second run changes nothing.
const db = require('../config/db');
const B = require('../config/billing');
const { runDaily } = require('./billingDaily');

const pool = db.promise();
const CHECK_MS = 30 * 60 * 1000;
const RUN_FROM_HOUR_UTC = 6;
const MAX_FAILED_PER_DAY = 3;
let timer = null;
let busy = false;

// Should a run start now? Not before 06:00 UTC; not if a run finished OK today, is running (less than 2 hours
// old) or has already failed 3 times today.
async function due(now = new Date()) {
  if (now.getUTCHours() < RUN_FROM_HOUR_UTC) return false;
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [[r]] = await pool.query(
    `SELECT SUM(status = 'ok') AS ok, SUM(status = 'running' AND started_at > UTC_TIMESTAMP() - INTERVAL 2 HOUR) AS running,
            SUM(status = 'failed') AS failed
     FROM billing_job_runs WHERE started_at >= ?`, [dayStart]
  );
  return !(Number(r.ok) > 0 || Number(r.running) > 0 || Number(r.failed) >= MAX_FAILED_PER_DAY);
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    if (await due()) {
      console.log('billing:daily (in-app) starting');
      await runDaily({ log: (m) => console.log(m) });
    }
  } catch (err) {
    console.error('billing:daily (in-app) failed:', err.message);
  } finally {
    busy = false;
  }
}

function start() {
  if (timer || !B.inAppDailyEnabled()) return;
  setTimeout(tick, 2 * 60 * 1000).unref();
  timer = setInterval(tick, CHECK_MS);
  timer.unref();
  console.log('billing:daily in-app scheduler on (daily from 06:00 UTC)');
}

module.exports = { start, due, tick };
