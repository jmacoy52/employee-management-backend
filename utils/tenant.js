const crypto = require('crypto');

function generateOrganizationId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `org_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
}

function getOrganizationId(req) {
  return req?.user?.organization_id || null;
}

module.exports = {
  generateOrganizationId,
  getOrganizationId
};
