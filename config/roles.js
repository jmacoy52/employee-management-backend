// Application roles and who may assign them.
const ROLES = ['employee', 'hr', 'admin'];

// Roles anyone can choose when signing up without being logged in.
const PUBLIC_SIGNUP_ROLES = ['employee', 'hr'];

const DEFAULT_ROLE = 'employee';
const MIN_PASSWORD_LENGTH = 8;

module.exports = { ROLES, PUBLIC_SIGNUP_ROLES, DEFAULT_ROLE, MIN_PASSWORD_LENGTH };
