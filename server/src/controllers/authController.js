const fs = require('fs');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const config = require('../config/config');
const { User, Company, SubscriptionPlan } = require('../models');
const userService = require('../services/userService');
const tokenService = require('../services/tokenService');
const passwordResetService = require('../services/passwordResetService');

const loadUserWithCompany = async (userId) => {
    return User.findByPk(userId, {
        include: [
            {
                model: Company,
                as: 'company',
                attributes: [
                    'id',
                    'name',
                    'businessEmail',
                    'inviteStatus',
                    'subscriptionStatus',
                    'trialEndsAt',
                    'discountPercent',
                    'whiteLabelLogoUrl',
                    'primaryBrandColor',
                    'secondaryBrandColor',
                    'brandFont',
                ],
                include: [
                    {
                        model: SubscriptionPlan,
                        as: 'subscriptionPlan',
                        required: false,
                        attributes: ['id', 'name', 'whiteLabelEnabled'],
                    },
                ],
                required: false,
            },
        ],
    });
};

const pickFirstDefined = (...values) => values.find((value) => value !== undefined);
const toBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

const getSessionMetaFromRequest = (req) => {
    return {
        clientType: pickFirstDefined(req.body?.clientType, req.headers['x-client-type']),
        isMobile: toBoolean(pickFirstDefined(req.body?.isMobile, req.headers['x-is-mobile'])),
        deviceId: pickFirstDefined(req.body?.deviceId, req.headers['x-device-id']),
        deviceName: pickFirstDefined(req.body?.deviceName, req.headers['x-device-name']),
        platform: pickFirstDefined(req.body?.platform, req.headers['x-platform']),
        appVersion: pickFirstDefined(req.body?.appVersion, req.headers['x-app-version']),
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
    };
};

const formatUserResponse = (req, user) => {
    if (!user) return null;
    const json = typeof user.toJSON === 'function' ? user.toJSON() : user;
    const { getMediaUrl } = require('../utils/mediaUrl');
    if (json.profileImageUrl !== undefined) {
        json.profileImageUrl = getMediaUrl(req, json.profileImageUrl);
    }
    if (json.company && json.company.whiteLabelLogoUrl !== undefined) {
        json.company.whiteLabelLogoUrl = getMediaUrl(req, json.company.whiteLabelLogoUrl);
    }
    return json;
};

/**
 * One-time: create first admin when database has zero users.
 * Requires SETUP_SECRET in env and matching setupSecret in body or x-setup-secret header.
 */
const bootstrapFirstAdmin = catchAsync(async (req, res) => {
    const count = await User.count();
    if (count > 0) {
        throw new ApiError(403, 'Initial setup has already been completed');
    }

    const configuredSecret = config.get('bootstrap.secret');
    if (!configuredSecret) {
        throw new ApiError(503, 'Server is not configured for initial setup. Set SETUP_SECRET in the environment.');
    }

    const setupSecret = req.body.setupSecret ?? req.headers['x-setup-secret'];
    if (!setupSecret || setupSecret !== configuredSecret) {
        throw new ApiError(403, 'Invalid setup secret');
    }

    const { email, password, username } = req.body;
    if (!email || !password || !username) {
        throw new ApiError(400, 'username, email, and password are required');
    }

    const user = await userService.createUser({
        email,
        password,
        username,
        role: 'admin',
    });
    const tokens = await tokenService.generateAuthTokens(user, getSessionMetaFromRequest(req));
    const full = await loadUserWithCompany(user.id);
    res.status(201).send({ user: formatUserResponse(req, full), tokens });
});

const register = catchAsync(async (req, res) => {
    const user = await userService.createUser(req.body);
    const tokens = await tokenService.generateAuthTokens(user, getSessionMetaFromRequest(req));
    const full = await loadUserWithCompany(user.id);
    res.status(201).send({ user: formatUserResponse(req, full), tokens });
});

const login = catchAsync(async (req, res) => {
    const { email, password } = req.body;
    const credUser = await userService.loginUserWithEmailAndPassword(email, password);
    let user = await loadUserWithCompany(credUser.id);

    // Block login if company is deactivated
    if (user?.role === 'user' && user.companyId) {
        const companyStatus = user.company?.subscriptionStatus;
        if (companyStatus === 'paused') {
            throw new ApiError(403, 'Your company subscription is currently paused. Please contact your administrator.');
        }
        if (companyStatus === 'cancelled') {
            throw new ApiError(403, 'Your company subscription has been cancelled. Please contact your administrator.');
        }
    }

    if (user?.role === 'user' && user.companyId && user.company?.inviteStatus === 'pending') {
        await Company.update({ inviteStatus: 'active', inviteCancelledAt: null }, { where: { id: user.companyId } });
        user = await loadUserWithCompany(credUser.id);
    }
    const tokens = await tokenService.generateAuthTokens(user, getSessionMetaFromRequest(req));
    res.send({ user: formatUserResponse(req, user), tokens });
});

const refreshTokens = catchAsync(async (req, res) => {
    const refreshToken = req.body?.refreshToken;
    const tokens = await tokenService.refreshAuth(refreshToken, getSessionMetaFromRequest(req));
    res.send({ tokens });
});

const getMe = catchAsync(async (req, res) => {
    const user = await loadUserWithCompany(req.user.id);
    res.send({ user: formatUserResponse(req, user) });
});

const updateMe = catchAsync(async (req, res) => {
    await userService.updateMyProfile(req.user, req.body);
    const user = await loadUserWithCompany(req.user.id);
    res.send({ user: formatUserResponse(req, user) });
});

const uploadAvatar = catchAsync(async (req, res) => {
    if (!req.file) {
        throw new ApiError(400, 'file is required');
    }
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(req.file.mimetype)) {
        try {
            fs.unlinkSync(req.file.path);
        } catch {
            /* ignore */
        }
        throw new ApiError(400, 'Only PNG, JPG, or WebP images are allowed');
    }
    const relativeUrl = `/uploads/avatars/${req.file.filename}`;
    await userService.updateMyProfile(req.user, { profileImageUrl: relativeUrl });
    const user = await loadUserWithCompany(req.user.id);
    const formattedUser = formatUserResponse(req, user);
    res.send({ user: formattedUser, profileImageUrl: formattedUser.profileImageUrl });
});

const logout = catchAsync(async (req, res) => {
    await tokenService.revokeTokenByPayload(req.tokenPayload);
    if (req.tokenPayload?.sid) {
        await tokenService.revokeSessionBySid(req.user.id, req.tokenPayload.sid, 'logout');
    }
    res.status(204).send();
});

const logoutAll = catchAsync(async (req, res) => {
    await tokenService.revokeTokenByPayload(req.tokenPayload);
    await tokenService.revokeAllSessionsForUser(req.user.id, 'logout all');
    res.status(204).send();
});

const listMySessions = catchAsync(async (req, res) => {
    const sessions = await tokenService.listActiveSessionsForUser(req.user.id);
    res.send({ sessions });
});

const revokeMySession = catchAsync(async (req, res) => {
    const { sid } = req.params;
    const count = await tokenService.revokeSessionBySid(req.user.id, sid, 'session revoked');
    if (count === 0) {
        throw new ApiError(404, 'Session not found');
    }
    res.status(204).send();
});

const forgotPassword = catchAsync(async (req, res) => {
    const result = await passwordResetService.requestPasswordResetOtp(req.body?.email);
    res.send(result);
});

const verifyResetOtp = catchAsync(async (req, res) => {
    const result = await passwordResetService.verifyPasswordResetOtp(req.body?.email, req.body?.otp);
    res.send(result);
});

const resetPassword = catchAsync(async (req, res) => {
    const result = await passwordResetService.completePasswordReset(req.body?.resetToken, req.body?.newPassword);
    res.send(result);
});

module.exports = {
    bootstrapFirstAdmin,
    register,
    login,
    refreshTokens,
    getMe,
    updateMe,
    uploadAvatar,
    logout,
    logoutAll,
    listMySessions,
    revokeMySession,
    forgotPassword,
    verifyResetOtp,
    resetPassword,
};
