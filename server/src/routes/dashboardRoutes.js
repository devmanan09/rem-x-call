const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticate);

router.get('/stats', dashboardController.getStats);
router.get('/recent-calls', dashboardController.getRecentCalls);
router.get('/follow-ups', dashboardController.getFollowUps);
router.get('/agent-performance', dashboardController.getAgentPerformance);
router.get('/product-overview', dashboardController.getProductOverview);
router.get('/call-chart', dashboardController.getCallChartData);

module.exports = router;
