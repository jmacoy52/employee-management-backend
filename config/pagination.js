// Reads ?limit=&offset= with safe bounds (default 500, max 1000).
function pagination(query = {}) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 500, 1), 1000);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  return { limit, offset };
}

module.exports = { pagination };
