// Plan enforcement (subscriptions, migration 009). Data is never hidden or deleted because of a plan:
//   requireFeature('payroll')     payroll changes need a plan with payroll; reading old payroll still works
//   requireFeature('auditLog')    the organisation audit log needs a plan with it (entries are still recorded)
//   requireEmployeeCapacity       creating an employee is blocked at the plan's cap (409 PLAN_LIMIT_REACHED)
//   requireEmployeesWithinLimit   above the cap (e.g. after dropping to Free) existing records are read-only:
//                                 they can be viewed and deleted, not edited
const { getEntitlements, usage } = require('../services/billing');

const FEATURE_TEXT = {
  payroll: { label: 'Payroll', plans: 'Starter, Growth and Business' },
  auditLog: { label: 'The organisation audit log', plans: 'Growth and Business' },
};

function guardError(res, err) {
  console.error('Plan check failed:', err.message);
  return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
}

function requireFeature(feature) {
  return async (req, res, next) => {
    try {
      const { ent } = await getEntitlements(req.user.organizationId);
      if (ent.features[feature]) return next();
      const t = FEATURE_TEXT[feature];
      return res.status(403).json({
        error: `${t.label} is not included in the ${ent.planName} plan. It is available on ${t.plans}.${req.user.role === 'admin' ? ' Upgrade on the Billing page.' : ' Ask your administrator to upgrade.'}`,
        code: 'PLAN_FEATURE_UNAVAILABLE', feature, plan: ent.plan,
      });
    } catch (err) {
      return guardError(res, err);
    }
  };
}

async function employeeCheck(req) {
  const { ent } = await getEntitlements(req.user.organizationId);
  const use = await usage(req.user.organizationId);
  return { ent, count: use.employees };
}

async function requireEmployeeCapacity(req, res, next) {
  try {
    const { ent, count } = await employeeCheck(req);
    if (ent.employeeCap == null || count < ent.employeeCap) return next();
    return res.status(409).json({
      error: `The ${ent.planName} plan includes up to ${ent.employeeCap} employees and your organisation has ${count}. ${req.user.role === 'admin' ? 'Upgrade on the Billing page to add more.' : 'Ask your administrator to upgrade to add more.'}`,
      code: 'PLAN_LIMIT_REACHED', limit: ent.employeeCap, count,
    });
  } catch (err) {
    return guardError(res, err);
  }
}

async function requireEmployeesWithinLimit(req, res, next) {
  try {
    const { ent, count } = await employeeCheck(req);
    if (ent.employeeCap == null || count <= ent.employeeCap) return next();
    return res.status(409).json({
      error: `Your organisation has ${count} employees but the ${ent.planName} plan includes ${ent.employeeCap}. Existing records are read-only until you upgrade or remove employees.`,
      code: 'PLAN_OVER_LIMIT', limit: ent.employeeCap, count,
    });
  } catch (err) {
    return guardError(res, err);
  }
}

module.exports = { requireFeature, requireEmployeeCapacity, requireEmployeesWithinLimit };
