const express = require('express');
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticate);

router.post('/fcm-token', notificationController.registerToken);
router.delete('/fcm-token', notificationController.unregisterToken);
router.get('/', notificationController.listNotifications);
router.patch('/:id/read', notificationController.markNotificationRead);
router.patch('/:id/archive', notificationController.archiveNotification);
router.patch('/:id/unarchive', notificationController.unarchiveNotification);
router.post('/read-all', notificationController.markAllNotificationsRead);

module.exports = router;
