const { FcmToken, Notification } = require('../models');
const ApiError = require('../utils/ApiError');
const { sendPushNotification } = require('../utils/firebase');

/**
 * Registers an FCM device token for a user.
 */
const registerFcmToken = async (userId, { token, platform, deviceId }) => {
    if (!token) {
        throw new ApiError(400, 'Token is required');
    }

    let existing = null;
    if (deviceId) {
        existing = await FcmToken.findOne({ where: { userId, deviceId } });
    } else {
        existing = await FcmToken.findOne({ where: { userId, token } });
    }

    if (existing) {
        existing.token = token;
        existing.platform = platform || existing.platform;
        existing.deviceId = deviceId || existing.deviceId;
        await existing.save();
        return existing;
    }

    return FcmToken.create({
        userId,
        token,
        platform: platform || null,
        deviceId: deviceId || null,
    });
};

/**
 * Unregisters (deletes) an FCM device token for a user.
 */
const unregisterFcmToken = async (userId, { token }) => {
    if (!token) {
        throw new ApiError(400, 'Token is required');
    }
    await FcmToken.destroy({ where: { userId, token } });
};

/**
 * Retrieves paginated notifications for a user, optionally filtered.
 */
const getNotifications = async (userId, { filter = 'all', page = 1, pageSize = 20 } = {}) => {
    // JIT Subscription Expiry Check for Agent
    try {
        const { User, Company, SubscriptionPlan } = require('../models');
        const user = await User.findByPk(userId);
        if (user && user.role === 'user' && user.companyId) {
            const company = await Company.findByPk(user.companyId, {
                include: [{ model: SubscriptionPlan, as: 'subscriptionPlan' }]
            });
            if (company && company.subscriptionStatus !== 'cancelled') {
                const now = new Date();
                const expiryDate = company.trialEndsAt 
                    ? new Date(company.trialEndsAt) 
                    : new Date(company.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
                
                const timeDiff = expiryDate.getTime() - now.getTime();
                const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
                
                if (timeDiff > 0 && timeDiff <= threeDaysMs) {
                    const { Op } = require('sequelize');
                    const existingWarning = await Notification.findOne({
                        where: {
                            userId,
                            type: 'billing',
                            title: {
                                [Op.or]: ['Subscription Expiring Soon', 'Trial Period Expiring Soon']
                            },
                            createdAt: {
                                [Op.gte]: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
                            }
                        }
                    });
                    
                    if (!existingWarning) {
                        const isTrial = company.subscriptionStatus === 'trial' || !!company.trialEndsAt;
                        const title = isTrial ? 'Trial Period Expiring Soon' : 'Subscription Expiring Soon';
                        const expiryStr = expiryDate.toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                        });
                        const body = isTrial 
                            ? `Your company's trial period ends on ${expiryStr}. Please upgrade your subscription to keep all features.`
                            : `Your company's subscription plan is ending on ${expiryStr}. Please renew your plan or contact the administrator.`;
                        
                        await createNotification({
                            userId,
                            title,
                            body,
                            type: 'billing',
                        });
                    }
                }
            }
        }
    } catch (err) {
        const logger = require('../utils/logger');
        logger.error('[NotificationService] Error in JIT subscription check:', err);
    }
    const safePage = Math.max(Number(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const offset = (safePage - 1) * safePageSize;

    const where = { userId };
    if (filter === 'unread') {
        where.isRead = false;
        where.isArchived = false;
    } else if (filter === 'read') {
        where.isRead = true;
        where.isArchived = false;
    } else if (filter === 'archived') {
        where.isArchived = true;
    } else {
        // 'all' includes non-archived notifications
        where.isArchived = false;
    }

    const { rows, count } = await Notification.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: safePageSize,
        offset,
    });

    const unreadCount = await Notification.count({
        where: { userId, isRead: false, isArchived: false },
    });

    return {
        items: rows,
        pagination: {
            page: safePage,
            pageSize: safePageSize,
            totalItems: count,
            totalPages: Math.max(1, Math.ceil(count / safePageSize)),
        },
        unreadCount,
    };
};

/**
 * Marks a specific notification as read.
 */
const markAsRead = async (userId, id) => {
    const notification = await Notification.findOne({ where: { id, userId } });
    if (!notification) {
        throw new ApiError(404, 'Notification not found');
    }
    notification.isRead = true;
    await notification.save();
    return notification;
};

/**
 * Archives a specific notification.
 */
const archiveNotification = async (userId, id) => {
    const notification = await Notification.findOne({ where: { id, userId } });
    if (!notification) {
        throw new ApiError(404, 'Notification not found');
    }
    notification.isArchived = true;
    await notification.save();
    return notification;
};

/**
 * Unarchives a specific notification.
 */
const unarchiveNotification = async (userId, id) => {
    const notification = await Notification.findOne({ where: { id, userId } });
    if (!notification) {
        throw new ApiError(404, 'Notification not found');
    }
    notification.isArchived = false;
    await notification.save();
    return notification;
};

/**
 * Marks all notifications for a user as read.
 */
const markAllAsRead = async (userId) => {
    const [markedCount] = await Notification.update(
        { isRead: true },
        { where: { userId, isRead: false, isArchived: false } }
    );
    return markedCount;
};

/**
 * Creates a notification in DB and sends a Firebase push if tokens exist.
 */
const createNotification = async ({ userId, title, body, type, dataPayload, senderAvatarUrl }) => {
    const notification = await Notification.create({
        userId,
        title,
        body,
        type: type || 'system',
        isRead: false,
        isArchived: false,
        senderAvatarUrl: senderAvatarUrl || null,
    });

    const fcmTokens = await FcmToken.findAll({ where: { userId } });
    const tokenStrings = fcmTokens.map((t) => t.token);

    if (tokenStrings.length > 0) {
        sendPushNotification(tokenStrings, {
            title,
            body,
            data: {
                id: String(notification.id),
                type: String(type || 'system'),
                ...dataPayload,
            },
        }).catch((err) => {
            const logger = require('../utils/logger');
            logger.error('[NotificationService] Error dispatching push:', err);
        });
    }

    return notification;
};

module.exports = {
    registerFcmToken,
    unregisterFcmToken,
    getNotifications,
    markAsRead,
    archiveNotification,
    unarchiveNotification,
    markAllAsRead,
    createNotification,
};
