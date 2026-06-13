const { Op, fn, col, literal } = require('sequelize');
const { CallLog, Contact, User, Company, SubscriptionPlan, Product } = require('../models');
const { getMediaUrl } = require('../utils/mediaUrl');

/**
 * Resolve a period string ('7d', '14d', '21d', '30d', '60d', '90d', 'overall') to a Date threshold.
 * Returns null for 'overall' (no date filter).
 */
const resolvePeriodStart = (period) => {
    const days = { '7d': 7, '14d': 14, '21d': 21, '30d': 30, '60d': 60, '90d': 90 };
    const d = days[period];
    if (!d) return null; // 'overall' or unrecognised
    return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
};

/**
 * Calculate percentage change between two counts.
 */
const percentChange = (current, previous) => {
    if (previous === 0 && current === 0) return 0;
    if (previous === 0) return 100;
    return parseFloat((((current - previous) / previous) * 100).toFixed(1));
};

/**
 * GET /dashboard/stats?period=30d
 */
const getStats = async ({ period = '30d' } = {}) => {
    const safePeriod = ['30d', '60d', '90d', 'overall'].includes(period) ? period : '30d';
    const periodStart = resolvePeriodStart(safePeriod);

    let previousPeriodStart = null;
    let previousPeriodEnd = null;
    if (safePeriod !== 'overall') {
        const days = { '30d': 30, '60d': 60, '90d': 90 }[safePeriod];
        previousPeriodStart = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000);
        previousPeriodEnd = periodStart;
    }

    const callWhere = (start, end) => {
        const w = {};
        if (start && end) {
            w.startedAt = { [Op.between]: [start, end] };
        } else if (start) {
            w.startedAt = { [Op.gte]: start };
        } else if (end) {
            w.startedAt = { [Op.lt]: end };
        }
        return w;
    };

    const totalCalls = await CallLog.count({ where: callWhere(periodStart, null) });
    const previousCalls = safePeriod !== 'overall' ? await CallLog.count({ where: callWhere(previousPeriodStart, previousPeriodEnd) }) : 0;

    const followUps = await CallLog.count({
        where: { ...callWhere(periodStart, null), outcome: 'Follow-up' },
    });
    const previousFollowUps = safePeriod !== 'overall' ? await CallLog.count({
        where: { ...callWhere(previousPeriodStart, previousPeriodEnd), outcome: 'Follow-up' },
    }) : 0;

    const totalCallsChangePercent = percentChange(totalCalls, previousCalls);
    const followUpsChangePercent = percentChange(followUps, previousFollowUps);

    // 2. Agents Overview
    const totalAgents = await User.count({ where: { role: 'user' } });
    const activeAgents = await User.count({ where: { role: 'user', isActive: true } });

    // 3. Subscriptions Overview
    const totalSubscriptions = await Company.count();
    const activeSubscriptions = await Company.count({ where: { subscriptionStatus: 'active' } });

    // 4. Contacts Overview
    const totalContacts = await Contact.count();
    const activeContacts = await Contact.count({ where: { status: 'active' } });

    return {
        totalCalls,
        totalCallsChangePercent,
        totalCallsChange: totalCallsChangePercent, // Keep compatibility
        followUps,
        followUpsChangePercent,
        followUpsChange: followUpsChangePercent, // Keep compatibility
        agents: { total: totalAgents, active: activeAgents },
        subscriptions: { total: totalSubscriptions, active: activeSubscriptions },
        contacts: { total: totalContacts, active: activeContacts },
        period: safePeriod,
    };
};

/**
 * GET /dashboard/recent-calls?page=1&pageSize=5&search=john
 */
const getRecentCalls = async ({ limit = 5, page = 1, pageSize, search = '', req } = {}) => {
    const safePage = Math.max(Number(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Number(pageSize) || Number(limit) || 5, 1), 50);
    const offset = (safePage - 1) * safePageSize;
    const q = String(search || '').trim();

    const contactInclude = {
        model: Contact,
        as: 'contact',
        attributes: ['id', 'fullName', 'phone', 'companyName', 'avatarUrl'],
        required: Boolean(q),
    };

    if (q) {
        contactInclude.where = {
            [Op.or]: [
                { fullName: { [Op.like]: `%${q}%` } },
                { phone: { [Op.like]: `%${q}%` } },
                { companyName: { [Op.like]: `%${q}%` } },
            ],
        };
    }

    const { rows: calls, count } = await CallLog.findAndCountAll({
        include: [
            contactInclude,
        ],
        order: [['startedAt', 'DESC']],
        limit: safePageSize,
        offset,
    });

    const data = calls.map((call) => {
        const c = call.contact;
        return {
            callId: call.id,
            id: call.id,
            contactId: call.contactId,
            contactName: c ? c.fullName : 'Unknown',
            contactAvatarUrl: c ? getMediaUrl(req, c.avatarUrl) : null,
            phone: c ? c.phone : 'Unknown',
            duration: call.durationSeconds,
            durationSeconds: call.durationSeconds,
            status: call.status,
            direction: 'outbound',
            recordingUrl: getMediaUrl(req, call.recordingUrl),
            calledAt: call.startedAt,
            contact: c ? {
                id: c.id,
                fullName: c.fullName,
                phone: c.phone,
                avatarUrl: getMediaUrl(req, c.avatarUrl),
            } : null,
        };
    });

    return {
        data,
        pagination: {
            page: safePage,
            pageSize: safePageSize,
            totalItems: count,
            totalPages: Math.max(1, Math.ceil(count / safePageSize)),
        },
    };
};

/**
 * GET /dashboard/follow-ups?limit=10
 *
 * Returns contacts whose most recent call outcome is "Follow-up" or who have a set followUpDate.
 */
const getFollowUps = async ({ limit = 10, page = 1, pageSize, req } = {}) => {
    const safePage = Math.max(Number(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Number(pageSize) || Number(limit) || 10, 1), 50);
    const offset = (safePage - 1) * safePageSize;

    const where = {
        [Op.or]: [
            { followUpDate: { [Op.ne]: null } },
            {
                id: {
                    [Op.in]: literal("(SELECT contactId FROM CallLogs AS c1 WHERE c1.startedAt = (SELECT MAX(c2.startedAt) FROM CallLogs AS c2 WHERE c2.contactId = c1.contactId) AND c1.outcome = 'Follow-up')")
                }
            }
        ]
    };

    const { rows: contacts, count: totalFollowUps } = await Contact.findAndCountAll({
        where,
        order: [['followUpDate', 'DESC'], ['updatedAt', 'DESC']],
        limit: safePageSize,
        offset,
    });

    const data = await Promise.all(
        contacts.map(async (c) => {
            const lastCall = await CallLog.findOne({
                where: { contactId: c.id },
                order: [['startedAt', 'DESC']],
            });

            return {
                contactId: c.id,
                contactName: c.fullName,
                contactAvatarUrl: getMediaUrl(req, c.avatarUrl),
                phone: c.phone,
                followUpDate: c.followUpDate || (lastCall ? new Date(lastCall.startedAt.getTime() + 2 * 24 * 60 * 60 * 1000) : null),
                lastCallDate: lastCall ? lastCall.startedAt : null,
            };
        })
    );

    return {
        totalFollowUps,
        data,
        pagination: {
            page: safePage,
            pageSize: safePageSize,
            totalItems: totalFollowUps,
            totalPages: Math.max(1, Math.ceil(totalFollowUps / safePageSize)),
        },
    };
};

const getAgentPerformance = async ({ page = 1, limit = 10 } = {}) => {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const offset = (safePage - 1) * safeLimit;

    // Fetch total count of agents (users with role 'user')
    const totalItems = await User.count({ where: { role: 'user' } });

    // Fetch agents for current page
    const agents = await User.findAll({
        where: { role: 'user' },
        include: [{ model: Company, as: 'company', attributes: ['name'] }],
        limit: safeLimit,
        offset: offset,
    });

    const performance = await Promise.all(
        agents.map(async (agent) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Subquery for contacts assigned to this agent
            const contactSubquery = literal(
                `(SELECT id FROM Contacts WHERE assignedAgentId = ${agent.id})`
            );

            const totalCalls = await CallLog.count({
                where: {
                    contactId: { [Op.in]: contactSubquery },
                    startedAt: { [Op.gte]: today },
                },
            });

            const connectedCalls = await CallLog.count({
                where: {
                    contactId: { [Op.in]: contactSubquery },
                    startedAt: { [Op.gte]: today },
                    outcome: 'Connected',
                },
            });

            const connectedPercent = totalCalls > 0 ? (connectedCalls / totalCalls) * 100 : 0;

            return {
                id: agent.id,
                agentName: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.username,
                company: agent.company?.name || 'N/A',
                callsToday: totalCalls,
                connectedPercent: parseFloat(connectedPercent.toFixed(1)),
                failedPercent: parseFloat((100 - connectedPercent).toFixed(1)),
            };
        })
    );

    return {
        items: performance,
        meta: {
            totalItems,
            itemCount: performance.length,
            itemsPerPage: safeLimit,
            totalPages: Math.ceil(totalItems / safeLimit),
            currentPage: safePage,
        },
    };
};

/**
 * GET /dashboard/product-overview
 * Returns totalProducts, totalProductsChangePercent, soldProducts, soldProductsChangePercent.
 */
const getProductOverview = async ({ period = '30d' } = {}) => {
    const safePeriod = ['7d', '14d', '21d', '30d', '60d', '90d', 'overall'].includes(period) ? period : '30d';
    const periodStart = resolvePeriodStart(safePeriod);

    let previousPeriodStart = null;
    let previousPeriodEnd = null;
    if (safePeriod !== 'overall') {
        const days = { '7d': 7, '14d': 14, '21d': 21, '30d': 30, '60d': 60, '90d': 90 }[safePeriod];
        previousPeriodStart = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000);
        previousPeriodEnd = periodStart;
    }

    const totalProducts = await Product.count();
    const currentProductsAdded = periodStart ? await Product.count({
        where: { createdAt: { [Op.gte]: periodStart } }
    }) : totalProducts;

    const previousProductsAdded = previousPeriodStart ? await Product.count({
        where: { createdAt: { [Op.between]: [previousPeriodStart, previousPeriodEnd] } }
    }) : 0;

    const totalProductsChangePercent = percentChange(currentProductsAdded, previousProductsAdded);

    const soldProducts = await Product.sum('sold') || 0;
    const currentSoldAdded = periodStart ? await Product.sum('sold', {
        where: { updatedAt: { [Op.gte]: periodStart } }
    }) || 0 : soldProducts;

    const previousSoldAdded = previousPeriodStart ? await Product.sum('sold', {
        where: { updatedAt: { [Op.between]: [previousPeriodStart, previousPeriodEnd] } }
    }) || 0 : 0;

    const soldProductsChangePercent = percentChange(currentSoldAdded, previousSoldAdded);

    return {
        totalProducts,
        totalProductsChangePercent,
        soldProducts,
        soldProductsChangePercent,
    };
};

/**
 * GET /dashboard/call-chart?period=weekly|monthly|daily
 * Returns per-day call breakdown (connected, busy, failed, missed) for the bar chart.
 */
const getCallChartData = async ({ period = 'weekly' } = {}) => {
    const now = new Date();
    const days = period === 'monthly' ? 30 : period === 'daily' ? 1 : 7;

    const result = [];

    for (let i = days - 1; i >= 0; i--) {
        const dayStart = new Date(now);
        dayStart.setDate(now.getDate() - i);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayStart.getDate() + 1);

        const where = { startedAt: { [Op.between]: [dayStart, dayEnd] } };

        const [connected, busy, failed, missed] = await Promise.all([
            CallLog.count({ where: { ...where, outcome: 'Connected' } }),
            CallLog.count({ where: { ...where, outcome: 'Busy' } }),
            CallLog.count({ where: { ...where, outcome: 'Failed' } }),
            CallLog.count({ where: { ...where, status: 'missed' } }),
        ]);

        // Label: for weekly show short day names, for monthly show date
        let name;
        if (period === 'daily') {
            name = 'Today';
        } else if (period === 'weekly') {
            const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            name = i === 0 ? 'Today' : DAY_NAMES[dayStart.getDay()];
        } else {
            name = `${dayStart.getDate()}/${dayStart.getMonth() + 1}`;
        }

        result.push({ name, connected, busy, failed, missed });
    }

    // Also return totals for the stat cards
    const periodStart = new Date(now);
    periodStart.setDate(now.getDate() - days);
    periodStart.setHours(0, 0, 0, 0);
    const periodWhere = { startedAt: { [Op.gte]: periodStart } };

    const [totalConnected, totalBusy, totalFailed, totalMissed] = await Promise.all([
        CallLog.count({ where: { ...periodWhere, outcome: 'Connected' } }),
        CallLog.count({ where: { ...periodWhere, outcome: 'Busy' } }),
        CallLog.count({ where: { ...periodWhere, outcome: 'Failed' } }),
        CallLog.count({ where: { ...periodWhere, status: 'missed' } }),
    ]);

    return {
        chartData: result,
        totals: {
            connected: totalConnected,
            busy: totalBusy,
            failed: totalFailed,
            noAnswer: totalMissed,
        },
    };
};

module.exports = {
    getStats,
    getRecentCalls,
    getFollowUps,
    getAgentPerformance,
    getProductOverview,
    getCallChartData,
};
