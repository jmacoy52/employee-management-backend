const AuditLogService = require('../services/auditLogService');

async function archiveLogs() {
  console.log('Archiving old audit logs...');
  await AuditLogService.archiveOldLogs();
  console.log('Archive complete. Run periodically via cron.');
}

// Run if direct
if (require.main === module) {
  archiveLogs().catch(console.error);
}

module.exports = { archiveLogs };
