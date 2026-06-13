const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize, Company, User, SubscriptionPlan, Message } = require('../models');
const ApiError = require('../utils/ApiError');
const { sendAgentInviteEmail } = require('./emailService');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeAgentName = (value) => String(value || '').trim().slice(0, 48);

const normalizeNamePart = (value) => {
    const v = String(value || '').trim().slice(0, 64);
    return v || null;
};

const normalizePhone = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const compact = raw.replace(/\s/g, '');
    return compact.slice(0, 32) || null;
};

/** Internal login id (DB unique). Derived from agent personal email local-part, never from phone. */
const usernameFromEmailLocalPart = (email) => {
    const local = normalizeEmail(email).split('@')[0] || '';
    const slug = local.replace(/[^a-z0-9._-]/gi, '').toLowerCase();
    const base = normalizeAgentName(slug);
    return base || 'agent';
};

const allocateUniqueUsername = async (email, { transaction } = {}) => {
    let base = usernameFromEmailLocalPart(email);
    if (!base) base = 'agent';
    let candidate = base;
    let n = 0;
    for (;;) {
        const existing = await User.findOne({ where: { username: candidate }, transaction });
        if (!existing) return candidate;
        n += 1;
        const suffix = String(n);
        candidate = normalizeAgentName(`${base}${suffix}`);
    }
};

const formatAgentDisplayName = (agentJson) => {
    if (!agentJson) return '';
    const full = `${agentJson.firstName || ''} ${agentJson.lastName || ''}`.trim();
    return full || agentJson.username || '';
};

const generateTemporaryPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%';
    let out = '';
    const bytes = crypto.randomBytes(32);
    for (let i = 0; i < 14; i += 1) {
        out += chars[bytes[i] % chars.length];
    }
    return out;
};

const normalizeColor = (value) => {
    const v = String(value || '').trim();
    if (!v) return null;
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : null;
};

const normalizeFont = (value) => {
    const v = String(value || '').trim();
    return v ? v.slice(0, 64) : null;
};
const DEFAULT_PRIMARY_BRAND_COLOR = '#000000';
const DEFAULT_SECONDARY_BRAND_COLOR = '#111111';

const toPositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return fallback;
    return parsed;
};

/** Sequelize `Company` instance with `members` association loaded. */
const getPrimaryCompanyAgentUser = (company) => {
    const members = company.members || [];
    return members.find((m) => m.role === 'user') || members[0] || null;
};

const shapeCompanyForResponse = (companyInstance) => {
    const json = typeof companyInstance.toJSON === 'function' ? companyInstance.toJSON() : companyInstance;
    const members = json.members || [];
    const agent = members.find((m) => m.role === 'user') || members[0] || null;
    delete json.members;
    const agentOut = agent
        ? { ...agent, displayName: formatAgentDisplayName(agent) }
        : null;
    return {
        ...json,
        agent: agentOut,
    };
};

const companyIdsMatchingAgentSearch = async (trimmed) => {
    if (!trimmed) return [];
    const agentRows = await User.findAll({
        where: {
            role: 'user',
            companyId: { [Op.ne]: null },
            [Op.or]: [
                { username: { [Op.like]: `%${trimmed}%` } },
                { email: { [Op.like]: `%${trimmed}%` } },
                { firstName: { [Op.like]: `%${trimmed}%` } },
                { lastName: { [Op.like]: `%${trimmed}%` } },
            ],
        },
        attributes: ['companyId'],
        raw: true,
    });
    return [...new Set(agentRows.map((r) => r.companyId).filter(Boolean))];
};

const listCompaniesForAdmin = async ({ page = 1, pageSize = 20, tab = 'all', q = '' } = {}) => {
    const safePage = toPositiveInt(page, 1);
    const safePageSize = Math.min(toPositiveInt(pageSize, 20), 100);
    const offset = (safePage - 1) * safePageSize;
    const trimmedQuery = String(q || '').trim();

    const clauses = [];
    if (tab === 'active') {
        clauses.push({ inviteStatus: { [Op.ne]: 'pending' } });
        clauses.push({ subscriptionStatus: { [Op.notIn]: ['cancelled'] } });
    } else if (tab === 'pending') {
        clauses.push({ inviteStatus: 'pending' });
    } else if (tab === 'all' || tab === 'subscriptions') {
        // no tab filter
    } else {
        throw new ApiError(400, 'Invalid companies tab');
    }

    if (trimmedQuery) {
        const agentCompanyIds = await companyIdsMatchingAgentSearch(trimmedQuery);
        clauses.push({
            [Op.or]: [
                { name: { [Op.like]: `%${trimmedQuery}%` } },
                ...(agentCompanyIds.length ? [{ id: { [Op.in]: agentCompanyIds } }] : []),
            ],
        });
    }

    const where = clauses.length ? { [Op.and]: clauses } : {};

    const { rows, count } = await Company.findAndCountAll({
        where,
        include: [
            {
                model: SubscriptionPlan,
                as: 'subscriptionPlan',
                required: false,
                attributes: ['id', 'name', 'priceMonthly', 'billingCycle'],
            },
            {
                model: User,
                as: 'members',
                required: false,
                attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'phone', 'role', 'isActive', 'createdAt'],
            },
        ],
        order: [['createdAt', 'DESC']],
        distinct: true,
        limit: safePageSize,
        offset,
    });

    return {
        items: rows.map(shapeCompanyForResponse),
        pagination: {
            page: safePage,
            pageSize: safePageSize,
            totalItems: count,
            totalPages: Math.max(1, Math.ceil(count / safePageSize)),
        },
    };
};

const createCompanyWithAgent = async (payload) => {
    const name = String(payload.companyName || payload.name || '').trim();
    if (!name) {
        throw new ApiError(400, 'Company name is required');
    }

    const businessEmail = normalizeEmail(payload.businessEmail ?? payload.companyBusinessEmail ?? payload.companyEmail);
    if (!businessEmail) {
        throw new ApiError(400, 'Business email is required');
    }

    const subscriptionPlanId = Number.parseInt(payload.subscriptionPlanId, 10);
    if (Number.isNaN(subscriptionPlanId) || subscriptionPlanId <= 0) {
        throw new ApiError(400, 'subscriptionPlanId is required');
    }

    const plan = await SubscriptionPlan.findByPk(subscriptionPlanId);
    if (!plan || !plan.isActive) {
        throw new ApiError(400, 'Invalid or inactive subscription plan');
    }

    // ── Enforce maxAgents limit ─────────────────────────────────────────────
    // maxAgents = 0 means unlimited
    if (plan.maxAgents > 0) {
        const currentAgentCount = await User.count({
            include: [{
                model: Company,
                as: 'company',
                where: { subscriptionPlanId: plan.id },
                required: true,
            }],
            where: { role: 'user' },
        });
        if (currentAgentCount >= plan.maxAgents) {
            throw new ApiError(400, `This plan allows a maximum of ${plan.maxAgents} agent(s). Limit reached.`);
        }
    }

    const email = normalizeEmail(payload.agentEmail);
    if (!email) {
        throw new ApiError(400, 'agentEmail is required');
    }

    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
        throw new ApiError(400, 'An account with this email already exists');
    }

    const firstName = normalizeNamePart(payload.agentFirstName ?? payload.firstName);
    const lastName = normalizeNamePart(payload.agentLastName ?? payload.lastName);
    if (!firstName || !lastName) {
        throw new ApiError(400, 'Agent first name and last name are required');
    }

    const phone = normalizePhone(payload.agentPhone ?? payload.phone);
    if (!phone) {
        throw new ApiError(400, 'Agent phone number is required');
    }

    const temporaryPassword = generateTemporaryPassword();
    const trialDays = Number.parseInt(payload.trialDays, 10) || 0;
    const discountPercent = Number.parseFloat(payload.discountPercent);
    const primaryBrandColor = normalizeColor(payload.primaryBrandColor);
    const secondaryBrandColor = normalizeColor(payload.secondaryBrandColor);
    const brandFont = normalizeFont(payload.brandFont);
    const whiteLabelLogoUrl = payload.whiteLabelLogoUrl ? String(payload.whiteLabelLogoUrl).trim().slice(0, 2048) : null;
    const trialEndsAt = trialDays > 0 ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000) : null;

    const result = await sequelize.transaction(async (t) => {
        const username = await allocateUniqueUsername(email, { transaction: t });

        const company = await Company.create(
            {
                name,
                businessEmail,
                subscriptionPlanId: plan.id,
                inviteStatus: 'pending',
                inviteSentAt: new Date(),
                inviteCancelledAt: null,
                subscriptionStatus: trialEndsAt ? 'trial' : 'active',
                trialEndsAt,
                discountPercent: Number.isNaN(discountPercent) ? 0 : Math.max(0, Math.min(100, discountPercent)),
                whiteLabelLogoUrl: plan.whiteLabelEnabled ? whiteLabelLogoUrl : null,
                primaryBrandColor: plan.whiteLabelEnabled ? primaryBrandColor : null,
                secondaryBrandColor: plan.whiteLabelEnabled ? secondaryBrandColor : null,
                brandFont: plan.whiteLabelEnabled ? brandFont : null,
            },
            { transaction: t }
        );

        const agent = await User.create(
            {
                username,
                email,
                password: temporaryPassword,
                role: 'user',
                companyId: company.id,
                isActive: true,
                firstName,
                lastName,
                phone,
            },
            { transaction: t }
        );

        return { company, agent, temporaryPassword };
    });

    await sendAgentInviteEmail({
        to: email,
        greetingName: firstName || result.agent.username,
        companyName: name,
        temporaryPassword: result.temporaryPassword,
    });

    const agentJson = result.agent.toJSON();
    delete agentJson.password;

    return {
        company: result.company.toJSON(),
        agent: agentJson,
        emailSent: true,
    };
};

const getCompanyModelById = async (companyId) => {
    const company = await Company.findByPk(companyId, {
        include: [
            {
                model: SubscriptionPlan,
                as: 'subscriptionPlan',
                required: false,
            },
            {
                model: User,
                as: 'members',
                required: false,
                attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'phone', 'role', 'isActive', 'createdAt'],
            },
        ],
    });
    if (!company) {
        throw new ApiError(404, 'Company not found');
    }
    return company;
};

const getCompanyById = async (companyId) => {
    const company = await getCompanyModelById(companyId);
    return shapeCompanyForResponse(company);
};

const updateCompanyByAdmin = async (companyId, payload, adminUser = null) => {
    const company = await getCompanyModelById(companyId);
    let effectivePlan = company.subscriptionPlan || null;

    const originalPlanId = company.subscriptionPlanId;
    const originalStatus = company.subscriptionStatus;
    const originalTrialEndsAt = company.trialEndsAt;
    const originalDiscount = company.discountPercent;

    if (payload.agentUsername !== undefined || payload.agentName !== undefined) {
        const nextAgentName = normalizeAgentName(payload.agentUsername ?? payload.agentName);
        if (!nextAgentName) {
            throw new ApiError(400, 'agentName cannot be empty');
        }
        const currentAgent = getPrimaryCompanyAgentUser(company);
        if (!currentAgent) {
            throw new ApiError(404, 'No agent account found for this company');
        }
        const existing = await User.findOne({ where: { username: nextAgentName } });
        if (existing && existing.id !== currentAgent.id) {
            throw new ApiError(400, 'An agent with this name already exists');
        }
        currentAgent.username = nextAgentName;
        await currentAgent.save();
    }
    const profileKeys = [
        'agentFirstName',
        'agentLastName',
        'agentPhone',
        'firstName',
        'lastName',
        'phone',
    ];
    if (profileKeys.some((k) => payload[k] !== undefined)) {
        const currentAgent = getPrimaryCompanyAgentUser(company);
        if (!currentAgent) {
            throw new ApiError(404, 'No agent account found for this company');
        }
        if (payload.agentFirstName !== undefined || payload.firstName !== undefined) {
            const v = normalizeNamePart(payload.agentFirstName ?? payload.firstName);
            if (!v) {
                throw new ApiError(400, 'Agent first name cannot be empty');
            }
            currentAgent.firstName = v;
        }
        if (payload.agentLastName !== undefined || payload.lastName !== undefined) {
            const v = normalizeNamePart(payload.agentLastName ?? payload.lastName);
            if (!v) {
                throw new ApiError(400, 'Agent last name cannot be empty');
            }
            currentAgent.lastName = v;
        }
        if (payload.agentPhone !== undefined || payload.phone !== undefined) {
            currentAgent.phone = normalizePhone(payload.agentPhone ?? payload.phone);
        }
        await currentAgent.save();
    }
    if (payload.companyName !== undefined || payload.name !== undefined) {
        const nextName = String(payload.companyName ?? payload.name ?? '').trim();
        if (!nextName) {
            throw new ApiError(400, 'Company name cannot be empty');
        }
        company.name = nextName;
    }
    if (
        payload.businessEmail !== undefined ||
        payload.companyBusinessEmail !== undefined ||
        payload.companyEmail !== undefined
    ) {
        const raw = payload.businessEmail ?? payload.companyBusinessEmail ?? payload.companyEmail;
        const be = normalizeEmail(raw);
        company.businessEmail = be || null;
    }
    if (payload.agentEmail !== undefined) {
        const nextEmail = normalizeEmail(payload.agentEmail);
        if (!nextEmail) {
            throw new ApiError(400, 'Agent email cannot be empty');
        }
        const currentAgent = getPrimaryCompanyAgentUser(company);
        if (!currentAgent) {
            throw new ApiError(404, 'No agent account found for this company');
        }
        const existing = await User.findOne({ where: { email: nextEmail } });
        if (existing && existing.id !== currentAgent.id) {
            throw new ApiError(400, 'An account with this email already exists');
        }
        currentAgent.email = nextEmail;
        await currentAgent.save();
    }
    if (payload.subscriptionPlanId !== undefined) {
        const planId = Number.parseInt(payload.subscriptionPlanId, 10);
        if (Number.isNaN(planId) || planId <= 0) throw new ApiError(400, 'Invalid subscriptionPlanId');
        const plan = await SubscriptionPlan.findByPk(planId);
        if (!plan) throw new ApiError(404, 'Subscription plan not found');
        company.subscriptionPlanId = planId;
        effectivePlan = plan;
    }
    if (payload.subscriptionStatus !== undefined) {
        const status = String(payload.subscriptionStatus || '').trim().toLowerCase();
        if (!['active', 'paused', 'cancelled', 'trial'].includes(status)) {
            throw new ApiError(400, 'Invalid subscriptionStatus');
        }
        company.subscriptionStatus = status;
    }
    if (payload.trialDays !== undefined) {
        const days = Number.parseInt(payload.trialDays, 10) || 0;
        company.trialEndsAt = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
        if (days > 0 && company.subscriptionStatus !== 'paused' && company.subscriptionStatus !== 'cancelled') {
            company.subscriptionStatus = 'trial';
        }
    }
    if (payload.trialEndsAt !== undefined) {
        company.trialEndsAt = payload.trialEndsAt ? new Date(payload.trialEndsAt) : null;
    }
    if (payload.discountPercent !== undefined) {
        const discount = Number.parseFloat(payload.discountPercent);
        if (Number.isNaN(discount) || discount < 0 || discount > 100) {
            throw new ApiError(400, 'discountPercent must be between 0 and 100');
        }
        company.discountPercent = discount;
    }
    const whiteLabelEnabled = Boolean(effectivePlan?.whiteLabelEnabled);
    if (!whiteLabelEnabled) {
        company.whiteLabelLogoUrl = null;
        company.primaryBrandColor = null;
        company.secondaryBrandColor = null;
        company.brandFont = null;
    } else {
        if (payload.whiteLabelLogoUrl !== undefined) {
            company.whiteLabelLogoUrl = payload.whiteLabelLogoUrl
                ? String(payload.whiteLabelLogoUrl).trim().slice(0, 2048)
                : null;
        }
        if (payload.primaryBrandColor !== undefined) {
            company.primaryBrandColor = normalizeColor(payload.primaryBrandColor);
        }
        if (payload.secondaryBrandColor !== undefined) {
            company.secondaryBrandColor = normalizeColor(payload.secondaryBrandColor);
        }
        if (payload.brandFont !== undefined) {
            company.brandFont = normalizeFont(payload.brandFont);
        }
    }
    if (payload.inviteStatus !== undefined) {
        const inviteStatus = String(payload.inviteStatus || '').trim().toLowerCase();
        if (!['pending', 'active', 'cancelled'].includes(inviteStatus)) {
            throw new ApiError(400, 'Invalid inviteStatus');
        }
        company.inviteStatus = inviteStatus;
        if (inviteStatus === 'pending') {
            company.inviteSentAt = new Date();
            company.inviteCancelledAt = null;
        } else if (inviteStatus === 'cancelled') {
            company.inviteCancelledAt = new Date();
        } else {
            company.inviteCancelledAt = null;
        }
    }
    await company.save();

    // Check if subscription plan details were updated
    const planChanged = originalPlanId !== company.subscriptionPlanId;
    const statusChanged = originalStatus !== company.subscriptionStatus;
    const trialChanged = (originalTrialEndsAt ? new Date(originalTrialEndsAt).getTime() : 0) !== (company.trialEndsAt ? new Date(company.trialEndsAt).getTime() : 0);
    const discountChanged = parseFloat(originalDiscount) !== parseFloat(company.discountPercent);

    if (planChanged || statusChanged || trialChanged || discountChanged) {
        const currentAgent = getPrimaryCompanyAgentUser(company);
        if (currentAgent) {
            const notificationService = require('./notificationService');
            
            // Build notification message
            let title = 'Subscription Plan Updated';
            let body = '';
            
            if (planChanged) {
                const newPlan = await SubscriptionPlan.findByPk(company.subscriptionPlanId);
                const oldPlan = originalPlanId ? await SubscriptionPlan.findByPk(originalPlanId) : null;
                const newPlanName = newPlan ? newPlan.name : 'None';
                const oldPlanName = oldPlan ? oldPlan.name : 'None';
                body += `Your subscription plan has been updated to "${newPlanName}" (previously "${oldPlanName}"). `;
            }
            if (statusChanged) {
                body += `Your subscription status is now "${company.subscriptionStatus}". `;
            }
            if (trialChanged) {
                if (company.trialEndsAt) {
                    body += `Your trial period now ends on ${new Date(company.trialEndsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}. `;
                } else {
                    body += `Your trial period has ended. `;
                }
            }
            if (discountChanged && !planChanged) {
                body += `A discount of ${company.discountPercent}% has been applied to your billing. `;
            }
            
            body = body.trim() || 'Your billing or subscription settings were updated by an administrator.';
            
            await notificationService.createNotification({
                userId: currentAgent.id,
                title,
                body,
                type: 'billing',
                senderAvatarUrl: adminUser ? adminUser.profileImageUrl : null,
                dataPayload: {
                    companyId: String(company.id),
                    updateType: 'subscription',
                }
            }).catch(err => {
                const logger = require('../utils/logger');
                logger.error('[CompanyService] Error creating billing notification:', err);
            });
        }
    }

    return getCompanyById(company.id);
};

const getPrimaryAgentForCompany = async (companyId) => {
    const agent = await User.findOne({
        where: { companyId, role: 'user' },
        order: [['id', 'ASC']],
    });
    if (!agent) {
        throw new ApiError(404, 'No agent account found for this company');
    }
    return agent;
};

const resendCompanyInvite = async (companyId) => {
    const company = await Company.findByPk(companyId);
    if (!company) throw new ApiError(404, 'Company not found');

    const agent = await getPrimaryAgentForCompany(companyId);
    if (!agent.email) {
        throw new ApiError(400, 'Agent email is missing');
    }

    const temporaryPassword = generateTemporaryPassword();
    agent.password = temporaryPassword;
    agent.isActive = true;
    await agent.save();

    company.inviteStatus = 'pending';
    company.inviteSentAt = new Date();
    company.inviteCancelledAt = null;
    await company.save();

    await sendAgentInviteEmail({
        to: agent.email,
        greetingName: agent.firstName || agent.username,
        companyName: company.name,
        temporaryPassword,
    });

    return { resent: true };
};

const cancelCompanyInvite = async (companyId) => {
    const company = await Company.findByPk(companyId);
    if (!company) throw new ApiError(404, 'Company not found');
    const agent = await getPrimaryAgentForCompany(companyId);
    agent.isActive = false;
    await agent.save();
    company.inviteStatus = 'cancelled';
    company.inviteCancelledAt = new Date();
    await company.save();
    return { cancelled: true };
};

const deleteCompanyByAdmin = async (companyId) => {
    const company = await Company.findByPk(companyId);
    if (!company) throw new ApiError(404, 'Company not found');
    await sequelize.transaction(async (t) => {
        await Message.destroy({ where: { companyId }, transaction: t });
        await User.destroy({ where: { companyId }, transaction: t });
        await Company.destroy({ where: { id: companyId }, transaction: t });
    });
    return { deleted: true };
};

const deleteCompaniesByAdmin = async (rawIds) => {
    const ids = [...new Set((rawIds || []).map((n) => Number.parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!ids.length) {
        throw new ApiError(400, 'companyIds is required');
    }
    const found = await Company.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id'] });
    if (found.length !== ids.length) {
        throw new ApiError(400, 'One or more companies were not found');
    }
    await sequelize.transaction(async (t) => {
        await Message.destroy({ where: { companyId: { [Op.in]: ids } }, transaction: t });
        await User.destroy({ where: { companyId: { [Op.in]: ids } }, transaction: t });
        await Company.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });
    });
    return { deleted: ids.length };
};

const getCompanyBrandingForUser = async (user) => {
    if (user.role === 'admin' || !user.companyId) {
        return null;
    }
    const company = await Company.findByPk(user.companyId, {
        include: [
            {
                model: SubscriptionPlan,
                as: 'subscriptionPlan',
                required: false,
                attributes: ['id', 'name', 'whiteLabelEnabled'],
            },
        ],
        attributes: ['id', 'name', 'businessEmail', 'whiteLabelLogoUrl', 'primaryBrandColor', 'secondaryBrandColor', 'brandFont'],
    });
    if (!company) return null;
    const json = company.toJSON();
    const whiteLabelEnabled = Boolean(json.subscriptionPlan?.whiteLabelEnabled);
    return {
        id: json.id,
        name: json.name,
        companyName: json.name,
        businessEmail: json.businessEmail,
        whiteLabelEnabled,
        whiteLabelLogoUrl: whiteLabelEnabled ? json.whiteLabelLogoUrl : null,
        primaryBrandColor:
            whiteLabelEnabled && json.primaryBrandColor ? json.primaryBrandColor : DEFAULT_PRIMARY_BRAND_COLOR,
        secondaryBrandColor:
            whiteLabelEnabled && json.secondaryBrandColor ? json.secondaryBrandColor : DEFAULT_SECONDARY_BRAND_COLOR,
        brandFont: whiteLabelEnabled ? json.brandFont : null,
    };
};

const assertWhiteLabelAccessForUser = async (user) => {
    if (user.role === 'admin') return true;
    if (!user.companyId) {
        throw new ApiError(403, 'No company is assigned to this account');
    }
    const company = await Company.findByPk(user.companyId, {
        include: [
            {
                model: SubscriptionPlan,
                as: 'subscriptionPlan',
                required: false,
                attributes: ['id', 'whiteLabelEnabled'],
            },
        ],
    });
    if (!company) {
        throw new ApiError(404, 'Company not found');
    }
    if (!company.subscriptionPlan?.whiteLabelEnabled) {
        throw new ApiError(403, 'White-label customization is not enabled for your subscription plan');
    }
    return true;
};

const updateCompanyBrandingForUser = async (user, payload = {}) => {
    if (!user.companyId || user.role === 'admin') {
        throw new ApiError(403, 'Only agent users can update their own branding');
    }
    
    const hasWhiteLabelFields = 
        payload.whiteLabelLogoUrl !== undefined ||
        payload.primaryBrandColor !== undefined ||
        payload.secondaryBrandColor !== undefined ||
        payload.brandFont !== undefined;

    if (hasWhiteLabelFields) {
        await assertWhiteLabelAccessForUser(user);
    }
    
    const company = await Company.findByPk(user.companyId);
    if (!company) {
        throw new ApiError(404, 'Company not found');
    }
    
    if (payload.companyName !== undefined || payload.name !== undefined) {
        const nextName = String(payload.companyName ?? payload.name ?? '').trim();
        if (!nextName) {
            throw new ApiError(400, 'Company name cannot be empty');
        }
        company.name = nextName;
    }
    
    if (payload.businessEmail !== undefined) {
        const be = normalizeEmail(payload.businessEmail);
        company.businessEmail = be || null;
    }
    
    if (payload.whiteLabelLogoUrl !== undefined) {
        company.whiteLabelLogoUrl = payload.whiteLabelLogoUrl
            ? String(payload.whiteLabelLogoUrl).trim().slice(0, 2048)
            : null;
    }
    if (payload.primaryBrandColor !== undefined) {
        company.primaryBrandColor = normalizeColor(payload.primaryBrandColor);
    }
    if (payload.secondaryBrandColor !== undefined) {
        company.secondaryBrandColor = normalizeColor(payload.secondaryBrandColor);
    }
    if (payload.brandFont !== undefined) {
        company.brandFont = normalizeFont(payload.brandFont);
    }
    await company.save();
    return getCompanyBrandingForUser(user);
};

module.exports = {
    listCompaniesForAdmin,
    createCompanyWithAgent,
    getCompanyById,
    updateCompanyByAdmin,
    resendCompanyInvite,
    cancelCompanyInvite,
    deleteCompanyByAdmin,
    deleteCompaniesByAdmin,
    getCompanyBrandingForUser,
    updateCompanyBrandingForUser,
    assertWhiteLabelAccessForUser,
};
