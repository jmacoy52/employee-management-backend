const express = require('express');
const router = express.Router();
const PayrollController = require('../controllers/payrollController');
const { authenticateToken, authorizeHR } = require('../middleware/authMiddleware');

// Every payroll route needs a signed-in user; all data is scoped to req.user.organizationId
router.use(authenticateToken);

// Employees: their own published payslips (view and PDF)
router.get('/my-payslips', PayrollController.myPayslips);
router.get('/my-payslips/:id', PayrollController.myPayslip);
router.get('/my-payslips/:id/pdf', PayrollController.myPayslipPdf);

// HR and admins: tax rules, pay details, payroll runs and payslips
router.get('/tax-rules', authorizeHR, PayrollController.taxRules);
router.post('/preview', authorizeHR, PayrollController.preview);
router.get('/pay-details', authorizeHR, PayrollController.listPayDetails);
router.get('/employees/:id/pay-details', authorizeHR, PayrollController.getPayDetails);
router.put('/employees/:id/pay-details', authorizeHR, PayrollController.savePayDetails);

router.get('/runs', authorizeHR, PayrollController.listRuns);
router.post('/runs', authorizeHR, PayrollController.createRun);
router.get('/runs/:period', authorizeHR, PayrollController.getRun);
router.post('/runs/:period/publish', authorizeHR, PayrollController.publish);

router.get('/payslips/:id', authorizeHR, PayrollController.getPayslip);
router.get('/payslips/:id/pdf', authorizeHR, PayrollController.payslipPdf);
router.delete('/payslips/:id', authorizeHR, PayrollController.deletePayslip);

module.exports = router;
