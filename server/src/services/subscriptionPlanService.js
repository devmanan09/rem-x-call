const { Op } = require('sequelize');
const { SubscriptionPlan } = require('../models');
const ApiError = require('../utils/ApiError');

const toBool = (v, fallback = false) => {
    if (v === undefined || v === null) return fallback;
    if (typeof v === 'boolean') return v;
    return Boolean(v);
};

const toPositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return fallback;
    return parsed;
};

const listPlans = async ({ activeOnly = false, page = 1, pageSize = 20, q = '' } = {}) => {
    const safePage = toPositiveInt(page, 1);
    const safePageSize = Math.min(toPositiveInt(pageSize, 20), 100);
    const offset = (safePage - 1) * safePageSize;
    const trimmed = String(q || '').trim();
    const clauses = [];
    if (activeOnly) clauses.push({ isActive: true });
    if (trimmed) clauses.push({ name: { [Op.like]: `%${trimmed}%` } });
    const where =
        clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : { [Op.and]: clauses };
    const { rows, count } = await SubscriptionPlan.findAndCountAll({
        where,
        order: [
            ['sortOrder', 'ASC'],
            ['id', 'ASC'],
        ],
        limit: safePageSize,
        offset,
    });
    return {
        items: rows,
        pagination: {
            page: safePage,
            pageSize: safePageSize,
            totalItems: count,
            totalPages: Math.max(1, Math.ceil(count / safePageSize)),
        },
    };
};

const getPlanById = async (id) => {
    const plan = await SubscriptionPlan.findByPk(id);
    if (!plan) {
        throw new ApiError(404, 'Subscription plan not found');
    }
    return plan;
};

const createPlan = async (payload) => {
    const name = String(payload.name || '').trim();
    if (!name) {
        throw new ApiError(400, 'Plan name is required');
    }
    return SubscriptionPlan.create({
        name,
        description: payload.description ? String(payload.description).trim() : null,
        priceMonthly: payload.priceMonthly ?? 0,
        billingCycle: payload.billingCycle === 'yearly' ? 'yearly' : 'monthly',
        maxAgents: payload.maxAgents !== undefined ? Number(payload.maxAgents) : 1,
        contactLimitLabel: payload.contactLimitLabel ? String(payload.contactLimitLabel).trim() : null,
        dialerEnabled: toBool(payload.dialerEnabled, true),
        chatEnabled: toBool(payload.chatEnabled, true),
        recordingEnabled: toBool(payload.recordingEnabled, false),
        whiteLabelEnabled: toBool(payload.whiteLabelEnabled, false),
        isActive: toBool(payload.isActive, true),
        sortOrder: payload.sortOrder !== undefined ? Number(payload.sortOrder) : 0,
    });
};

const updatePlan = async (id, payload) => {
    const plan = await getPlanById(id);
    const fields = [
        'name',
        'description',
        'priceMonthly',
        'billingCycle',
        'maxAgents',
        'contactLimitLabel',
        'dialerEnabled',
        'chatEnabled',
        'recordingEnabled',
        'whiteLabelEnabled',
        'isActive',
        'sortOrder',
    ];
    for (const f of fields) {
        if (payload[f] !== undefined) {
            if (f === 'billingCycle') {
                plan.billingCycle = payload.billingCycle === 'yearly' ? 'yearly' : 'monthly';
            } else if (['dialerEnabled', 'chatEnabled', 'recordingEnabled', 'whiteLabelEnabled', 'isActive'].includes(f)) {
                plan[f] = toBool(payload[f]);
            } else {
                plan[f] = payload[f];
            }
        }
    }
    if (payload.name !== undefined) {
        plan.name = String(payload.name).trim();
    }
    await plan.save();
    return plan;
};

const deletePlan = async (id) => {
    const plan = await getPlanById(id);

    // Check if any company is currently using this plan
    const { Company } = require('../models');
    const usageCount = await Company.count({ where: { subscriptionPlanId: id } });
    if (usageCount > 0) {
        // Soft-delete: mark as inactive instead of deleting
        // This preserves the plan for existing companies while hiding it from new sign-ups
        plan.isActive = false;
        await plan.save();
        return { softDeleted: true, usageCount };
    }

    // No companies using this plan — safe to hard delete
    await plan.destroy();
    return { softDeleted: false };
};

module.exports = {
    listPlans,
    getPlanById,
    createPlan,
    updatePlan,
    deletePlan,
};
