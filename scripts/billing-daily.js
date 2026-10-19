// npm run billing:daily - the daily billing job (see services/billingDaily.js). Render runs it as a cron job at
// 06:00 UTC (render.yaml). Exits 1 when a step failed, so the failure shows in Render's cron history.
require('dotenv').config();
const db = require('../config/db');
const { runDaily } = require('../services/billingDaily');

runDaily()
  .then(({ summary }) => {
    process.exitCode = summary.errors ? 1 : 0;
  })
  .catch((err) => {
    console.error('billing:daily failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end(() => {}));
