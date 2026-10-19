// Application roles and who may assign them.
const ROLES = ['employee', 'hr', 'admin'];

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

module.exports = { ROLES, PUBLIC_SIGNUP_ROLES, DEFAULT_ROLE, MIN_PASSWORD_LENGTH, MAX_PASSWORD_BYTES, passwordProblem };
