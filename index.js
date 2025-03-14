import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import Coupon from './server/models/Coupon.js';
import CouponClaim from './server/models/CouponClaim.js';

const app = express();
const PORT = process.env.PORT || 5000;

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

        await mongoose.connect(process.env.MONGODB_URI);
        isConnected = true;
        console.log('Successfully connected to MongoDB');

        // Log the number of available coupons
        const couponCount = await Coupon.countDocuments();
        console.log(`Number of coupons in database: ${couponCount}`);

        // Seed coupons if none exist
        if (couponCount === 0) {
            const coupons = [
                { code: 'SAVE10', description: 'Save 10% on your purchase', discount: 10 },
                { code: 'SAVE15', description: 'Save 15% on your purchase', discount: 15 },
                { code: 'SAVE20', description: 'Save 20% on your purchase', discount: 20 },
                { code: 'SAVE25', description: 'Save 25% on your purchase', discount: 25 },
                { code: 'SAVE30', description: 'Save 30% on your purchase', discount: 30 },
            ];
            await Coupon.insertMany(coupons);
            console.log('Initial coupons seeded successfully');
        }
    } catch (error) {
        console.error('MongoDB connection error:', error);
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

// Add cookie check middleware
app.use((req, res, next) => {
    if (!req.cookies.sessionId && req.path !== '/api/coupons/status') {
        const sessionId = Math.random().toString(36).substring(2);
        res.cookie('sessionId', sessionId, {
            maxAge: 86400000, // 24 hours
            httpOnly: true,
            secure: true,
            sameSite: 'none',
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
        return res.status(503).json({ error: 'Database connection not available' });
    }

    try {
        // Get all coupons with their claim status
        const coupons = await Coupon.find();

        // Get all recent claims (within last 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentClaims = await CouponClaim.find({
            claimedAt: { $gt: oneDayAgo }
        }).populate('couponId');

        // Map coupons to include claim status
        const couponsWithStatus = coupons.map(coupon => {
            const claim = recentClaims.find(claim =>
                claim.couponId._id.toString() === coupon._id.toString()
            );

            return {
                ...coupon.toObject(),
                claimed: !!claim,
                claimedAt: claim?.claimedAt || null,
                claimedBy: claim?.sessionId || null
            };
        });

        res.json(couponsWithStatus);
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/coupons/next', async (req, res) => {
    try {
        const sessionId = req.cookies.sessionId;
        const ipAddress = req.ip || req.connection.remoteAddress;

        if (!sessionId) {
            return res.status(400).json({ error: 'No session ID found' });
        }

        console.log('Session ID:', sessionId);
        console.log('IP Address:', ipAddress);

        // Check if user has claimed a coupon in the last hour (by session or IP)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        // First, check for any claims by this session or IP in the last hour
        const recentClaims = await CouponClaim.find({
            $or: [
                { sessionId: sessionId },
                { ipAddress: ipAddress }
            ],
            claimedAt: { $gt: oneHourAgo }
        }).sort({ claimedAt: -1 });

        console.log('Recent claims found:', recentClaims.length);

        if (recentClaims.length > 0) {
            const mostRecentClaim = recentClaims[0];
            const timeLeft = Math.ceil((mostRecentClaim.claimedAt.getTime() + 3600000 - Date.now()) / 60000);
            return res.status(400).json({
                error: `You can only claim one coupon per hour. Please wait ${timeLeft} minutes before claiming another coupon.`
            });
        }

        // Get all coupons this user has ever claimed
        const userClaimedCoupons = await CouponClaim.find({
            $or: [
                { sessionId: sessionId },
                { ipAddress: ipAddress }
            ]
        }).select('couponId');

        const claimedCouponIds = userClaimedCoupons.map(c => c.couponId);

        // Get all available coupons that this user hasn't claimed before
        const availableCoupons = await Coupon.find({
            _id: { $nin: claimedCouponIds }
        });

        if (availableCoupons.length === 0) {
            // If no unclaimed coupons available, reset all claims older than 24 hours
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            await CouponClaim.deleteMany({
                claimedAt: { $lt: oneDayAgo }
            });

            // Try to find a coupon again after resetting
            const newAvailableCoupons = await Coupon.find();

            if (newAvailableCoupons.length === 0) {
                return res.status(404).json({ error: 'No coupons available' });
            }

            // Get recent claims to avoid giving recently claimed coupons
            const recentClaimedCouponIds = await CouponClaim.find({
                claimedAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) } // Last 5 minutes
            }).select('couponId');

            const recentlyClaimedIds = recentClaimedCouponIds.map(c => c.couponId.toString());

            // Filter out recently claimed coupons
            const eligibleCoupons = newAvailableCoupons.filter(
                coupon => !recentlyClaimedIds.includes(coupon._id.toString())
            );

            if (eligibleCoupons.length === 0) {
                // If all coupons were recently claimed, wait a bit and try again
                await new Promise(resolve => setTimeout(resolve, 5000));
                return res.status(429).json({ error: 'Please try again in a few seconds' });
            }

            // Randomly select a coupon from eligible ones
            const randomIndex = Math.floor(Math.random() * eligibleCoupons.length);
            const newCoupon = eligibleCoupons[randomIndex];

            // Create a new claim record
            await CouponClaim.create({
                sessionId,
                ipAddress,
                couponId: newCoupon._id,
                claimedAt: new Date()
            });

            console.log('Coupon claimed successfully (after reset):', {
                code: newCoupon.code,
                claimedBy: sessionId,
                claimedByIP: ipAddress,
                claimedAt: new Date()
            });

            return res.json({
                code: newCoupon.code,
                description: newCoupon.description,
                discount: newCoupon.discount
            });
        }

        // Get recent claims to avoid giving recently claimed coupons
        const recentClaimedCouponIds = await CouponClaim.find({
            claimedAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) } // Last 5 minutes
        }).select('couponId');

        const recentlyClaimedIds = recentClaimedCouponIds.map(c => c.couponId.toString());

        // Filter out recently claimed coupons from available ones
        const eligibleCoupons = availableCoupons.filter(
            coupon => !recentlyClaimedIds.includes(coupon._id.toString())
        );

        if (eligibleCoupons.length === 0) {
            // If all coupons were recently claimed, wait a bit and try again
            await new Promise(resolve => setTimeout(resolve, 5000));
            return res.status(429).json({ error: 'Please try again in a few seconds' });
        }

        // Randomly select a coupon from eligible ones
        const randomIndex = Math.floor(Math.random() * eligibleCoupons.length);
        const coupon = eligibleCoupons[randomIndex];

        // Create a new claim record
        await CouponClaim.create({
            sessionId,
            ipAddress,
            couponId: coupon._id,
            claimedAt: new Date()
        });

        console.log('Coupon claimed successfully:', {
            code: coupon.code,
            claimedBy: sessionId,
            claimedByIP: ipAddress,
            claimedAt: new Date()
        });

        // Return full coupon details
        res.json({
            code: coupon.code,
            description: coupon.description,
            discount: coupon.discount
        });
    } catch (error) {
        console.error('Error claiming coupon:', error);
        res.status(500).json({ error: 'Failed to claim coupon' });
    }
});

// Serve static files from the dist directory
const distPath = join(__dirname, process.env.NODE_ENV === 'production' ? '.' : 'dist');
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