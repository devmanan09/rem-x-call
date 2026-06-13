const catchAsync = require('../utils/catchAsync');
const notificationService = require('../services/notificationService');

const registerToken = catchAsync(async (req, res) => {
    const token = await notificationService.registerFcmToken(req.user.id, req.body);
    res.status(201).send({ token });
});

const unregisterToken = catchAsync(async (req, res) => {
    await notificationService.unregisterFcmToken(req.user.id, req.body);
    res.status(200).send({ message: 'Token unregistered' });
});

const listNotifications = catchAsync(async (req, res) => {
    const result = await notificationService.getNotifications(req.user.id, {
        filter: req.query.filter || 'all',
        page: req.query.page,
        pageSize: req.query.pageSize,
    });

    const { getMediaUrl } = require('../utils/mediaUrl');
    const formattedItems = result.items.map((notif) => {
        const item = notif.toJSON();
        if (item.senderAvatarUrl) {
            item.senderAvatarUrl = getMediaUrl(req, item.senderAvatarUrl);
        }
        return item;
    });

    res.send({
        data: formattedItems,
        pagination: result.pagination,
        unreadCount: result.unreadCount,
    });
});

const markNotificationRead = catchAsync(async (req, res) => {
    const notification = await notificationService.markAsRead(req.user.id, req.params.id);
    res.send({ notification });
});

const archiveNotification = catchAsync(async (req, res) => {
    const notification = await notificationService.archiveNotification(req.user.id, req.params.id);
    res.send({ notification });
});

const unarchiveNotification = catchAsync(async (req, res) => {
    const notification = await notificationService.unarchiveNotification(req.user.id, req.params.id);
    res.send({ notification });
});

const markAllNotificationsRead = catchAsync(async (req, res) => {
    const markedCount = await notificationService.markAllAsRead(req.user.id);
    res.send({ markedCount });
});

module.exports = {
    registerToken,
    unregisterToken,
    listNotifications,
    markNotificationRead,
    archiveNotification,
    unarchiveNotification,
    markAllNotificationsRead,
};
