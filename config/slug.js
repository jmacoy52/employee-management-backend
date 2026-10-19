// Organisation slugs (URL-safe, unique). No database pool here, so CLI scripts can use it.

// "Accra Logistics Ltd." -> "accra-logistics-ltd"
function slugify(name) {
  const base = String(name || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/g, '');
  return base || 'organisation';
}

// A slug nobody uses yet: "acme", then "acme-2", "acme-3", ... (conn: a mysql2 promise connection)
async function uniqueSlug(conn, name) {
  const base = slugify(name);
  const [rows] = await conn.query('SELECT slug FROM organizations WHERE slug = ? OR slug LIKE ?', [base, `${base}-%`]);
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i += 1) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

module.exports = { slugify, uniqueSlug };
