// Application roles and who may assign them.
// These are the roles inside an organisation. The platform 'owner' (super admin) is not one of
// them: it has no organisation, cannot be assigned through any org route and is created only by
// the one-time bootstrap endpoint or `npm run create-owner`.
const ROLES = ['employee', 'hr', 'admin'];
const OWNER_ROLE = 'owner';

// Roles anyone can choose when signing up without being logged in.
// HR accounts can see salaries, so only an admin may create them.
const PUBLIC_SIGNUP_ROLES = ['employee'];

const DEFAULT_ROLE = 'employee';
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything after 72 bytes

// Returns an error message, or null when the password is acceptable.
function passwordProblem(password) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  if (Buffer.byteLength(value, 'utf8') > MAX_PASSWORD_BYTES) return `Password must be at most ${MAX_PASSWORD_BYTES} bytes long`;
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return 'Password must contain at least one letter and one number';
  return null;
}

// Stricter rules for the platform owner, who can see every organisation.
const MIN_OWNER_PASSWORD_LENGTH = 12;
function ownerPasswordProblem(password, email = '') {
  const value = String(password || '');
  if (value.length < MIN_OWNER_PASSWORD_LENGTH) return `Owner password must be at least ${MIN_OWNER_PASSWORD_LENGTH} characters long`;
  if (Buffer.byteLength(value, 'utf8') > MAX_PASSWORD_BYTES) return `Password must be at most ${MAX_PASSWORD_BYTES} bytes long`;
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return 'Password must contain at least one letter and one number';
  if (new Set(value).size < 6) return 'Password is too repetitive';
  const local = String(email || '').split('@')[0].toLowerCase();
  if (local.length >= 4 && value.toLowerCase().includes(local)) return 'Password must not contain your e-mail name';
  return null;
}

module.exports = { ROLES, OWNER_ROLE, MIN_OWNER_PASSWORD_LENGTH, ownerPasswordProblem, PUBLIC_SIGNUP_ROLES, DEFAULT_ROLE, MIN_PASSWORD_LENGTH, MAX_PASSWORD_BYTES, passwordProblem };
