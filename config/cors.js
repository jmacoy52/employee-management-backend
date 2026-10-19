// CORS allow-list.
//   ALLOWED_ORIGINS  comma-separated origins; "*" wildcards allowed in the host,
//                    e.g. "https://emplocore.vercel.app,https://emplocore-*.vercel.app"
// Defaults cover production, Vercel preview deployments of the "emplocore" project and local dev.
const DEFAULT_ORIGINS = [
  'https://emplocore.vercel.app',
  'https://emplocore-*.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function toRegex(pattern) {
  const escaped = pattern.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+');
  return new RegExp(`^${escaped}$`, 'i');
}

const patterns = (process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : DEFAULT_ORIGINS
).filter(Boolean).map(toRegex);

function isAllowedOrigin(origin) {
  return patterns.some((re) => re.test(origin));
}

const corsOptions = {
  origin(origin, callback) {
    // Requests without an Origin header (curl, server-to-server, health checks) are allowed.
    if (!origin || isAllowedOrigin(origin)) return callback(null, true);
    return callback(null, false); // browser blocks it; no 500 error
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
};

module.exports = { corsOptions, isAllowedOrigin };
