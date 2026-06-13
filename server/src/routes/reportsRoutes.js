const express = require('express');
const reportsController = require('../controllers/reportsController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticate);

router.get('/filter-options', reportsController.getFilterOptions);
router.get('/call-stats', reportsController.getCallStats);
router.get('/revenue', reportsController.getRevenue);

module.exports = router;
