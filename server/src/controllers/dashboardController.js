const catchAsync = require('../utils/catchAsync');
const dashboardService = require('../services/dashboardService');

const getStats = catchAsync(async (req, res) => {
    const stats = await dashboardService.getStats({ period: req.query.period });
    res.send(stats);
});

const getRecentCalls = catchAsync(async (req, res) => {
    const result = await dashboardService.getRecentCalls({ 
        limit: req.query.limit,
        page: req.query.page,
        pageSize: req.query.pageSize,
        search: req.query.search,
        req,
    });
    res.send({ data: result.data, recentCalls: result.data, pagination: result.pagination });
});

const getFollowUps = catchAsync(async (req, res) => {
    const result = await dashboardService.getFollowUps({ 
        limit: req.query.limit,
        page: req.query.page,
        pageSize: req.query.pageSize,
        req,
    });
    res.send({ 
        totalFollowUps: result.totalFollowUps,
        data: result.data,
        pagination: result.pagination,
    });
});

const getAgentPerformance = catchAsync(async (req, res) => {
    const { page, limit } = req.query;
    const performanceData = await dashboardService.getAgentPerformance({ page, limit });
    res.send({ agentPerformance: performanceData.items, meta: performanceData.meta });
});

const getProductOverview = catchAsync(async (req, res) => {
    const stats = await dashboardService.getProductOverview({ 
        period: req.query.period,
    });
    res.send(stats);
});

const getCallChartData = catchAsync(async (req, res) => {
    const data = await dashboardService.getCallChartData({
        period: req.query.period || 'weekly',
    });
    res.send(data);
});

module.exports = {
    getStats,
    getRecentCalls,
    getFollowUps,
    getAgentPerformance,
    getProductOverview,
    getCallChartData,
};
