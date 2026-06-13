const express = require('express');
const authRoutes = require('./authRoutes');
const contactRoutes = require('./contactRoutes');
const messageRoutes = require('./messageRoutes');
const subscriptionPlanRoutes = require('./subscriptionPlanRoutes');
const companyRoutes = require('./companyRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const subscriptionRoutes = require('./subscriptionRoutes');
const productRoutes = require('./productRoutes');
const notificationRoutes = require('./notificationRoutes');
const callRoutes = require('./callRoutes');
const reportsRoutes = require('./reportsRoutes');

const router = express.Router();

const defaultRoutes = [
    {
        path: '/auth',
        route: authRoutes,
    },
    {
        path: '/contacts',
        route: contactRoutes,
    },
    {
        path: '/messages',
        route: messageRoutes,
    },
    {
        path: '/subscription-plans',
        route: subscriptionPlanRoutes,
    },
    {
        path: '/companies',
        route: companyRoutes,
    },
    {
        path: '/dashboard',
        route: dashboardRoutes,
    },
    {
        path: '/subscriptions',
        route: subscriptionRoutes,
    },
    {
        path: '/products',
        route: productRoutes,
    },
    {
        path: '/notifications',
        route: notificationRoutes,
    },
    {
        path: '/calls',
        route: callRoutes,
    },
    {
        path: '/reports',
        route: reportsRoutes,
    },
];

defaultRoutes.forEach((route) => {
    router.use(route.path, route.route);
});

module.exports = router;
