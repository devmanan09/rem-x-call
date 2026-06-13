const catchAsync = require('../utils/catchAsync');
const reportsService = require('../services/reportsService');

/**
 * GET /reports/filter-options
 * Returns companies and agents lists for filter dropdowns.
 */
const getFilterOptions = catchAsync(async (req, res) => {
    const data = await reportsService.getFilterOptions();
    res.send(data);
});

/**
 * GET /reports/call-stats?period=30d&companyId=1&agentId=2&dateFrom=2026-01-01&dateTo=2026-06-01
 */
const getCallStats = catchAsync(async (req, res) => {
    const { period, companyId, agentId, dateFrom, dateTo } = req.query;
    const data = await reportsService.getCallStats({ period, companyId, agentId, dateFrom, dateTo });
    res.send(data);
});

/**
 * GET /reports/revenue?companyId=1&dateFrom=2026-01-01&dateTo=2026-06-01
 */
const getRevenue = catchAsync(async (req, res) => {
    const { companyId, dateFrom, dateTo } = req.query;
    const data = await reportsService.getRevenue({ companyId, dateFrom, dateTo });
    res.send(data);
});

module.exports = {
    getFilterOptions,
    getCallStats,
    getRevenue,
};
