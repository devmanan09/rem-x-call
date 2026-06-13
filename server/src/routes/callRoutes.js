const express = require('express');
const callController = require('../controllers/callController');
const { authenticate } = require('../middleware/authMiddleware');
const requireFeature = require('../middleware/requireFeature');

const router = express.Router();

router.use(authenticate);

router.post('/initiate', requireFeature('dialerEnabled'), callController.initiateCall);

module.exports = router;
