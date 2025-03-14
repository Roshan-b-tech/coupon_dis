import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Stripe from 'stripe';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();

// Define paths early
const distPath = join(__dirname, process.env.NODE_ENV === 'production' ? '.' : 'dist');

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import Coupon from './server/models/Coupon.js';
import CouponClaim from './server/models/CouponClaim.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Stripe
const stripe = new Stripe('sk_test_tR3PYbcVNZZ796tH88S4VQ2u');

// Initialize MongoDB connection
let isConnected = false;

const connectToMongoDB = async () => {
    if (isConnected) return;

    try {
        console.log('Attempting to connect to MongoDB...');
        console.log('Current environment:', process.env.NODE_ENV);
        console.log('Server port:', process.env.PORT);
        console.log('MongoDB URI status:', process.env.MONGODB_URI ? 'Defined' : 'Undefined');
        console.log('Current directory:', __dirname);

        if (!process.env.MONGODB_URI) {
            console.log('Available environment variables:', Object.keys(process.env));
            throw new Error('MONGODB_URI is not defined in environment variables');
        }

        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000
        });

        // Test the connection
        await mongoose.connection.db.admin().ping();

        isConnected = true;
        console.log('Successfully connected to MongoDB');
        console.log('MongoDB connection state:', mongoose.connection.readyState);

        // Log the number of available coupons
        const couponCount = await Coupon.countDocuments();
        console.log(`Number of coupons in database: ${couponCount}`);

        // Seed coupons if none exist
        if (couponCount === 0) {
            console.log('No coupons found, initiating seed process...');
            await seedCoupons();
        }
    } catch (error) {
        console.error('MongoDB connection error:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        isConnected = false;
        setTimeout(connectToMongoDB, 5000);
    }
};

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            'https://freecoupon60min.netlify.app',
            'http://localhost:5173',
            'https://coupon-dis.onrender.com'
        ];

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Cookie'],
    exposedHeaders: ['Set-Cookie']
}));

// Add pre-flight handling
app.options('*', cors());

app.use(cookieParser());
app.use(express.json());

// Add rate limiting middleware
const rateLimit = require('express-rate-limit');

// Rate limiter for coupon claims
const couponLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 1, // 1 request per hour
    message: 'Too many coupon claims from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: false,
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    }
});

// Rate limiter for status checks
const statusLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: 'Too many status checks, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});

// Apply rate limiters
app.use('/api/coupons/next', couponLimiter);
app.use('/api/coupons/status', statusLimiter);

// Add security headers middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// Enhanced cookie check middleware
app.use((req, res, next) => {
    if (!req.cookies.sessionId && req.path !== '/api/coupons/status') {
        const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
        res.cookie('sessionId', sessionId, {
            maxAge: 86400000, // 24 hours
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            path: '/'
        });
        req.cookies.sessionId = sessionId;
    }
    next();
});

// Connection check middleware
app.use(async (req, res, next) => {
    if (!isConnected) {
        await connectToMongoDB();
    }
    next();
});

// API Routes
app.get('/api/coupons/status', async (req, res) => {
    if (!isConnected) {
        return res.status(503).json({
            error: 'Database connection not available',
            retryAfter: 30 // seconds
        });
    }

    try {
        // Get all coupons with their claim status
        const coupons = await Coupon.find();

        // Get all recent claims (within last 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentClaims = await CouponClaim.find({
            claimedAt: { $gt: oneDayAgo }
        }).populate('couponId');

        // Map coupons to include claim status and availability
        const couponsWithStatus = coupons.map(coupon => {
            const claim = recentClaims.find(claim =>
                claim.couponId._id.toString() === coupon._id.toString()
            );

            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            const isRecentlyClaimed = claim && claim.claimedAt > tenMinutesAgo;

            return {
                ...coupon.toObject(),
                claimed: !!claim,
                claimedAt: claim?.claimedAt || null,
                claimedBy: claim?.sessionId || null,
                available: !isRecentlyClaimed,
                nextAvailable: isRecentlyClaimed ?
                    new Date(claim.claimedAt.getTime() + 10 * 60 * 1000) : null
            };
        });

        res.json({
            coupons: couponsWithStatus,
            totalAvailable: couponsWithStatus.filter(c => c.available).length,
            totalCoupons: couponsWithStatus.length
        });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).json({
            error: 'Internal server error',
            retryAfter: 5 // seconds
        });
    }
});

// Modify the seedCoupons function to create Stripe coupons
async function seedCoupons() {
    try {
        const count = await Coupon.countDocuments();
        if (count === 0) {
            // Create a Stripe coupon
            const stripeCoupon = await stripe.coupons.create({
                duration: 'repeating',
                duration_in_months: 3,
                percent_off: 25.5,
                id: `SAVE25_${Date.now()}` // Generate unique ID
            });

            // Store the reference in our database
            const coupon = new Coupon({
                code: stripeCoupon.id,
                description: 'Save 25.5% on your purchase',
                discount: 25.5,
                stripeId: stripeCoupon.id
            });
            await coupon.save();
            console.log('Initial Stripe coupon created successfully');
        }
    } catch (error) {
        console.error('Error seeding coupons:', error);
    }
}

app.post('/api/coupons/next', async (req, res) => {
    try {
        const sessionId = req.cookies.sessionId;
        const ipAddress = req.ip || req.connection.remoteAddress;

        console.log('Attempting to claim coupon with:', {
            sessionId,
            ipAddress,
            timestamp: new Date().toISOString()
        });

        if (!sessionId) {
            console.log('No session ID found in request');
            return res.status(400).json({
                error: 'No session ID found',
                retryAfter: 1
            });
        }

        // Check for recent claims
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentClaims = await CouponClaim.find({
            $or: [
                { sessionId: sessionId },
                { ipAddress: ipAddress }
            ],
            claimedAt: { $gt: oneHourAgo }
        }).sort({ claimedAt: -1 });

        console.log('Recent claims found:', recentClaims.length);

        if (recentClaims.length > 0) {
            const timeLeft = Math.ceil((recentClaims[0].claimedAt.getTime() + 3600000 - Date.now()) / 60000);
            console.log('User has recent claim, time left:', timeLeft, 'minutes');
            return res.status(429).json({
                error: `You can only claim one coupon per hour. Please wait ${timeLeft} minutes before claiming another coupon.`,
                retryAfter: timeLeft * 60
            });
        }

        // Get available coupon
        const coupon = await Coupon.findOne();
        console.log('Found existing coupon:', coupon ? 'yes' : 'no');

        if (!coupon) {
            console.log('No existing coupon found, creating new Stripe coupon');
            try {
                // Create a new Stripe coupon if none exists
                const stripeCoupon = await stripe.coupons.create({
                    duration: 'repeating',
                    duration_in_months: 3,
                    percent_off: 25.5,
                    id: `SAVE25_${Date.now()}`
                });
                console.log('Stripe coupon created successfully:', stripeCoupon.id);

                const newCoupon = new Coupon({
                    code: stripeCoupon.id,
                    description: 'Save 25.5% on your purchase',
                    discount: 25.5,
                    stripeId: stripeCoupon.id
                });
                await newCoupon.save();
                console.log('New coupon saved to database:', newCoupon._id);

                // Create claim record
                const claim = await CouponClaim.create({
                    sessionId,
                    ipAddress,
                    couponId: newCoupon._id,
                    claimedAt: new Date()
                });
                console.log('Claim record created:', claim._id);

                return res.json({
                    code: newCoupon.code,
                    description: newCoupon.description,
                    discount: newCoupon.discount,
                    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 3 months
                });
            } catch (stripeError) {
                console.error('Stripe coupon creation error:', stripeError);
                throw stripeError;
            }
        }

        console.log('Creating claim for existing coupon:', coupon._id);
        // Create claim record for existing coupon
        const claim = await CouponClaim.create({
            sessionId,
            ipAddress,
            couponId: coupon._id,
            claimedAt: new Date()
        });
        console.log('Claim record created:', claim._id);

        res.json({
            code: coupon.code,
            description: coupon.description,
            discount: coupon.discount,
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 3 months
        });
    } catch (error) {
        console.error('Error claiming coupon:', {
            error: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({
            error: 'Failed to claim coupon: ' + error.message,
            retryAfter: 5
        });
    }
});

// Serve static files from the dist directory
app.use(express.static(distPath));

// Handle all other routes by serving the index.html
app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
});

// Start server and connect to MongoDB
const startServer = async () => {
    try {
        await connectToMongoDB();

        const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Server environment: ${process.env.NODE_ENV}`);
            console.log('CORS origins:', ['https://freecoupon60min.netlify.app', 'http://localhost:5173']);
            console.log('Static files served from:', distPath);
        });

        server.on('error', (error) => {
            console.error('Server error:', error);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Add error handlers
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

startServer().catch(console.error); 