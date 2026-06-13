const { Company, SubscriptionPlan } = require('../models');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

/**
 * Middleware factory — checks that the agent's company plan has a feature enabled.
 * Admin users are always allowed through.
 *
 * Usage:
 *   router.post('/initiate', authenticate, requireFeature('dialerEnabled'), controller)
 *
 * @param {'dialerEnabled'|'chatEnabled'|'recordingEnabled'|'whiteLabelEnabled'} feature
 */
const requireFeature = (feature) =>
    catchAsync(async (req, res, next) => {
        // Admins have no plan restrictions
        if (req.user.role === 'admin') return next();

        if (!req.user.companyId) {
            throw new ApiError(403, 'No company assigned to this account.');
        }

        const company = await Company.findByPk(req.user.companyId, {
            include: [{
                model: SubscriptionPlan,
                as: 'subscriptionPlan',
                required: false,
                attributes: ['id', 'dialerEnabled', 'chatEnabled', 'recordingEnabled', 'whiteLabelEnabled'],
            }],
        });

        if (!company) {
            throw new ApiError(403, 'Company not found.');
        }

        const plan = company.subscriptionPlan;
        if (!plan || !plan[feature]) {
            const labels = {
                dialerEnabled: 'Dialer / calling',
                chatEnabled: 'Chat / messaging',
                recordingEnabled: 'Call recording',
                whiteLabelEnabled: 'White-label branding',
            };
            throw new ApiError(403, `${labels[feature] || feature} is not included in your current subscription plan.`);
        }

        next();
    });

module.exports = requireFeature;
