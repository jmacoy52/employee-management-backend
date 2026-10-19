// Fixed choices on the public "Register your organisation" form. The frontend shows the same
// lists (src/config/signupOptions.js); keep them in step.
const ORG_TYPES = [
  'Private company',
  'Small or medium business',
  'School or college',
  'NGO or non-profit',
  'Healthcare',
  'Government or public sector',
  'Faith-based organisation',
  'Hospitality',
  'Retail',
  'Manufacturing',
  'Agriculture',
  'Technology',
  'Other',
];

const SIZE_RANGES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

// Digits, spaces, +, -, ( and ); 7 to 25 characters
const PHONE_RE = /^\+?[0-9 ()-]{7,25}$/;

module.exports = { ORG_TYPES, SIZE_RANGES, PHONE_RE };
