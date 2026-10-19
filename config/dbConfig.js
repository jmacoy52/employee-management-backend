// Builds mysql2 connection options from environment variables.
//
//   DB_URL (or DATABASE_URL)   mysql://user:password@host:port/database[?ssl-mode=REQUIRED]
//   DB_PORT                    optional, used only if DB_URL has no port
//   DB_SSL                     "true" / "false" (default: true when ssl-mode=REQUIRED in the URL
//                              or a CA is supplied, otherwise false)
//   DB_SSL_CA                  CA certificate PEM text ("\n" escapes allowed)
//   DB_SSL_CA_BASE64           CA certificate PEM, base64-encoded (handy for dashboards)
//   DB_SSL_CA_PATH             path to a CA certificate file (e.g. a Render secret file)
//   DB_SSL_REJECT_UNAUTHORIZED "false" to skip certificate verification (NOT recommended)
//   DB_CONNECTION_LIMIT        pool size (default 5; free MySQL plans have low limits)
const fs = require('fs');

function readCa() {
  if (process.env.DB_SSL_CA) return process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  if (process.env.DB_SSL_CA_BASE64) return Buffer.from(process.env.DB_SSL_CA_BASE64, 'base64').toString('utf8');
  if (process.env.DB_SSL_CA_PATH) return fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8');
  return null;
}

function buildDbConfig(extra = {}) {
  const raw = process.env.DB_URL || process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DB_URL is not set. Expected mysql://user:password@host:port/database');
  }

  const url = new URL(raw);
  const sslMode = (url.searchParams.get('ssl-mode') || url.searchParams.get('sslmode') || '').toUpperCase();
  const ca = readCa();

  let useSsl;
  if (process.env.DB_SSL !== undefined) {
    useSsl = String(process.env.DB_SSL).toLowerCase() === 'true';
  } else {
    useSsl = sslMode === 'REQUIRED' || sslMode === 'VERIFY_CA' || sslMode === 'VERIFY_IDENTITY' || Boolean(ca);
  }

  const config = {
    host: url.hostname,
    port: Number(url.port || process.env.DB_PORT || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || undefined,
    charset: 'utf8mb4',
    timezone: 'Z',
    connectTimeout: 20000,
    ...extra,
  };

  if (useSsl) {
    config.ssl = {
      rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false',
      minVersion: 'TLSv1.2',
    };
    if (ca) config.ssl.ca = ca;
  }

  return config;
}

module.exports = { buildDbConfig };
