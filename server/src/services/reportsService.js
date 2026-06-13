const { Op } = require('sequelize');
const { CallLog, SubscriptionHistory, Company, User, Contact } = require('../models');

/**
 * Resolve a period string to days count.
 */
const periodToDays = (period) => {
    const map = { '7d': 7, '14d': 14, '21d': 21, '30d': 30, '60d': 60, '90d': 90 };
    return map[period] || 30;
};

/**
 * Calculate percentage change.
 */
const percentChange = (current, previous) => {
    if (previous === 0 && current === 0) return 0;
    if (previous === 0) return 100;
    return parseFloat((((current - previous) / previous) * 100).toFixed(1));
};

/**
 * GET /reports/filter-options
 * Returns list of companies and agents for the filter dropdowns.
 */
const getFilterOptions = async () => {
    const [companies, agents] = await Promise.all([
        Company.findAll({ attributes: ['id', 'name'], order: [['name', 'ASC']] }),
        User.findAll({
            where: { role: 'user', isActive: true },
            attributes: ['id', 'firstName', 'lastName', 'username'],
            order: [['firstName', 'ASC']],
        }),
    ]);

    return {
        companies: companies.map((c) => ({ id: c.id, name: c.name })),
        agents: agents.map((a) => ({
            id: a.id,
            name: `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.username,
        })),
    };
};

/**
 * Build a date range where clause from period string OR explicit dateFrom/dateTo.
 */
const buildDateWhere = ({ period, dateFrom, dateTo }) => {
    // If explicit date range provided
    if (dateFrom || dateTo) {
        const w = {};
        if (dateFrom && dateTo) w[Op.between] = [new Date(dateFrom), new Date(dateTo)];
        else if (dateFrom) w[Op.gte] = new Date(dateFrom);
        else w[Op.lte] = new Date(dateTo);
        return w;
    }
    // Fall back to period
    if (period === 'overall') return null;
    const days = periodToDays(period);
    return { [Op.gte]: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
};

/**
 * GET /reports/call-stats
 * Returns per-status call counts, trends vs previous period, and monthly chart data.
 * Supports filters: period, dateFrom, dateTo, companyId, agentId
 */
const getCallStats = async ({ period = '30d', dateFrom, dateTo, companyId, agentId } = {}) => {
    // ── Build contact ID sublist for company/agent filters ──────────────────
    let contactIds = null;

    if (companyId || agentId) {
        const contactWhere = {};
        if (agentId) contactWhere.assignedAgentId = agentId;

        // If companyId filter: find agents in that company first
        if (companyId) {
            const agentsInCompany = await User.findAll({
                where: { companyId, role: 'user' },
                attributes: ['id'],
            });
            const agentIds = agentsInCompany.map((a) => a.id);
            if (agentIds.length === 0) {
                // No agents in this company → no calls
                return {
                    stats: [
                        { label: 'Total Calls', value: 0, trend: 0, up: true },
                        { label: 'Connected Calls', value: 0, trend: 0, up: true },
                        { label: 'No Answer', value: 0, trend: 0, up: true },
                        { label: 'Busy', value: 0, trend: 0, up: true },
                        { label: 'Failed', value: 0, trend: 0, up: true },
                    ],
                    chartData: [],
                };
            }
            contactWhere.assignedAgentId = agentId
                ? (agentIds.includes(Number(agentId)) ? agentId : -1)
                : { [Op.in]: agentIds };
        }

        const contacts = await Contact.findAll({ where: contactWhere, attributes: ['id'] });
        contactIds = contacts.map((c) => c.id);
    }

    // ── Date range for current period ───────────────────────────────────────
    const dateWhere = buildDateWhere({ period, dateFrom, dateTo });

    // For trend comparison — only when using period (not custom date range)
    let prevDateWhere = null;
    if (!dateFrom && !dateTo && period !== 'overall') {
        const days = periodToDays(period);
        const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        prevDateWhere = {
            [Op.between]: [
                new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000),
                periodStart,
            ],
        };
    }

    // ── Count helper ────────────────────────────────────────────────────────
    const countCalls = async (dateFilter, extraWhere = {}) => {
        const w = { ...extraWhere };
        if (contactIds !== null) w.contactId = { [Op.in]: contactIds };
        if (dateFilter) w.startedAt = dateFilter;
        return CallLog.count({ where: w });
    };

    const [
        totalCalls, prevTotal,
        connectedCalls, prevConnected,
        noAnswerCalls, prevNoAnswer,
        busyCalls, prevBusy,
        failedCalls, prevFailed,
    ] = await Promise.all([
        countCalls(dateWhere),
        prevDateWhere ? countCalls(prevDateWhere) : Promise.resolve(0),
        countCalls(dateWhere, { outcome: 'Connected' }),
        prevDateWhere ? countCalls(prevDateWhere, { outcome: 'Connected' }) : Promise.resolve(0),
        countCalls(dateWhere, { status: 'missed' }),
        prevDateWhere ? countCalls(prevDateWhere, { status: 'missed' }) : Promise.resolve(0),
        countCalls(dateWhere, { outcome: 'Busy' }),
        prevDateWhere ? countCalls(prevDateWhere, { outcome: 'Busy' }) : Promise.resolve(0),
        countCalls(dateWhere, { outcome: 'Failed' }),
        prevDateWhere ? countCalls(prevDateWhere, { outcome: 'Failed' }) : Promise.resolve(0),
    ]);

    const stats = [
        { label: 'Total Calls',     value: totalCalls,     trend: Math.abs(percentChange(totalCalls,     prevTotal)),     up: totalCalls     >= prevTotal },
        { label: 'Connected Calls', value: connectedCalls, trend: Math.abs(percentChange(connectedCalls, prevConnected)), up: connectedCalls >= prevConnected },
        { label: 'No Answer',       value: noAnswerCalls,  trend: Math.abs(percentChange(noAnswerCalls,  prevNoAnswer)),  up: noAnswerCalls  >= prevNoAnswer },
        { label: 'Busy',            value: busyCalls,      trend: Math.abs(percentChange(busyCalls,      prevBusy)),      up: busyCalls      >= prevBusy },
        { label: 'Failed',          value: failedCalls,    trend: Math.abs(percentChange(failedCalls,    prevFailed)),    up: failedCalls    >= prevFailed },
    ];

    // ── Monthly chart: last 12 months ───────────────────────────────────────
    const now = new Date();
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = [];

    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const w = { startedAt: { [Op.between]: [start, end] } };
        if (contactIds !== null) w.contactId = { [Op.in]: contactIds };
        const count = await CallLog.count({ where: w });
        chartData.push({ name: MONTHS[d.getMonth()], value: count });
    }

    return { stats, chartData };
};

/**
 * GET /reports/revenue
 * Returns total revenue, refunded revenue, trend, and monthly chart data.
 * Supports filters: companyId, dateFrom, dateTo
 */
const getRevenue = async ({ companyId, dateFrom, dateTo } = {}) => {
    const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const now = new Date();

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = currentMonthStart;

    // Base where for company filter
    const baseWhere = {};
    if (companyId) baseWhere.companyId = companyId;

    // Custom date range on top
    if (dateFrom || dateTo) {
        if (dateFrom && dateTo) baseWhere.date = { [Op.between]: [new Date(dateFrom), new Date(dateTo)] };
        else if (dateFrom) baseWhere.date = { [Op.gte]: new Date(dateFrom) };
        else baseWhere.date = { [Op.lte]: new Date(dateTo) };
    }

    const sumRevenue = async (extraWhere = {}) => {
        const result = await SubscriptionHistory.sum('price', {
            where: { ...baseWhere, ...extraWhere, status: 'paid' },
        });
        return parseFloat(result) || 0;
    };
    const sumRefunded = async (extraWhere = {}) => {
        const result = await SubscriptionHistory.sum('price', {
            where: { ...baseWhere, ...extraWhere, status: 'refunded' },
        });
        return parseFloat(result) || 0;
    };

    const [totalRevenue, totalRefunded, currentRevenue, previousRevenue, currentRefunded, previousRefunded] =
        await Promise.all([
            sumRevenue(),
            sumRefunded(),
            sumRevenue({ date: { [Op.gte]: currentMonthStart } }),
            sumRevenue({ date: { [Op.between]: [prevMonthStart, prevMonthEnd] } }),
            sumRefunded({ date: { [Op.gte]: currentMonthStart } }),
            sumRefunded({ date: { [Op.between]: [prevMonthStart, prevMonthEnd] } }),
        ]);

    const revenueTrend = percentChange(currentRevenue, previousRevenue);
    const refundedTrend = percentChange(currentRefunded, previousRefunded);

    // Monthly chart current year vs previous year
    const currentYear = now.getFullYear();
    const chartData = [];

    for (let month = 0; month < 12; month++) {
        const monthStart = new Date(currentYear, month, 1);
        const monthEnd = new Date(currentYear, month + 1, 1);
        const prevYearStart = new Date(currentYear - 1, month, 1);
        const prevYearEnd = new Date(currentYear - 1, month + 1, 1);

        const [current, previous] = await Promise.all([
            sumRevenue({ date: { [Op.between]: [monthStart, monthEnd] } }),
            sumRevenue({ date: { [Op.between]: [prevYearStart, prevYearEnd] } }),
        ]);

        chartData.push({ name: MONTHS[month], current, previous });
    }

    return { totalRevenue, totalRefunded, revenueTrend, refundedTrend, chartData };
};

module.exports = {
    getFilterOptions,
    getCallStats,
    getRevenue,
};
