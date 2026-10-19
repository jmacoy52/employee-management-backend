// One-time platform owner bootstrap (POST /api/platform/bootstrap-owner).
// The endpoint creates the first 'owner' account only while no owner exists, and only for a
// request carrying the setup token whose bcrypt hash is configured here. Once an owner exists it
// answers 410 Gone for good.
//   OWNER_SETUP_TOKEN_HASH  bcrypt hash of the setup token (overrides the committed default below).
//                           Generate a token and its hash with:
//                             node -e "const t=require('crypto').randomBytes(32).toString('base64url');console.log(t);console.log(require('bcryptjs').hashSync(t,12))"
//                           Keep the token secret; put only the hash in the environment.
// The committed hash belongs to a token held privately by the maintainer. It is a hash (not the
// token), so it is safe to publish; it stops working as soon as the first owner exists.
const DEFAULT_OWNER_SETUP_TOKEN_HASH = '$2b$12$7t7lIEuBodk8ifG.4wtgA.X4cG7NoDaxUPQVZYkbkCE85/j9FNY3K';

function ownerSetupTokenHash() {
  const fromEnv = String(process.env.OWNER_SETUP_TOKEN_HASH || '').trim();
  return fromEnv || DEFAULT_OWNER_SETUP_TOKEN_HASH;
}

module.exports = { ownerSetupTokenHash, DEFAULT_OWNER_SETUP_TOKEN_HASH };
