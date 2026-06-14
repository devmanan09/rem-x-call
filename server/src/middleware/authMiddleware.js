const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { User, RevokedToken } = require('../models');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

/**
 * Require a valid Bearer JWT. Sets req.user to the Sequelize User instance.
 */
const authenticate = catchAsync(async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        throw new ApiError(401, 'Please authenticate');
    }

    const token = header.split(' ')[1];
    if (!token) {
        throw new ApiError(401, 'Please authenticate');
    }

    let payload;
    try {
        payload = jwt.verify(token, config.get('jwt.secret'));
    } catch (err) {
        throw new ApiError(401, 'Invalid or expired token');
    }

    const userId = payload.sub;
    const tokenId = payload.jti;
    if (!userId || !tokenId) {
        throw new ApiError(401, 'Invalid token payload');
    }
    if (payload.tokenType && payload.tokenType !== 'access') {
        throw new ApiError(401, 'Invalid token type for this endpoint');
    }

    const revokedToken = await RevokedToken.findOne({ where: { jti: tokenId } });
    if (revokedToken) {
        throw new ApiError(401, 'Token has been revoked');
    }

    const user = await User.findByPk(userId);
    if (!user) {
        throw new ApiError(401, 'User not found');
    }
    if (!user.isActive) {
        throw new ApiError(401, 'Account is disabled');
    }

    // Check if agent's company is deactivated (blocks active sessions too)
    if (user.role === 'user' && user.companyId) {
        const { Company } = require('../models');
        const company = await Company.findByPk(user.companyId, {
            attributes: ['subscriptionStatus'],
        });
        if (company?.subscriptionStatus === 'paused') {
            throw new ApiError(403, 'Your company subscription is currently paused. Please contact your administrator.');
        }
        if (company?.subscriptionStatus === 'cancelled') {
            throw new ApiError(403, 'Your company subscription has been cancelled. Please contact your administrator.');
        }
    }

    req.user = user;
    req.token = token;
    req.tokenPayload = payload;
    next();
});

module.exports = {
    authenticate,
};
