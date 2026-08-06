require('dotenv').config();
require('express-async-errors');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const xssClean = require('xss-clean');

const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const foodRoutes = require('./routes/foodRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adRoutes = require('./routes/adRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const staffRoutes = require('./routes/staffRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();

// Trust Railway's reverse proxy so req.ip / rate limiting work correctly
app.set('trust proxy', 1);

// ---------- Security middleware ----------
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(hpp()); // protects against HTTP parameter pollution
app.use(mongoSanitize()); // strips $/. operators from input (defense in depth)
app.use(xssClean()); // sanitizes user input against basic XSS payloads
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ---------- Body parsing ----------
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ---------- Global rate limit ----------
app.use('/api', apiLimiter);

// ---------- Health check ----------
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', time: new Date().toISOString() }));

// ---------- Routes ----------
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/foods', foodRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/webhooks', webhookRoutes);

// ---------- 404 + error handling ----------
app.use(notFound);
app.use(errorHandler);

module.exports = app;
