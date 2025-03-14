import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Stripe from 'stripe';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import Coupon from './server/models/Coupon.js';
import CouponClaim from './server/models/CouponClaim.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();

// Define paths early
const distPath = join(__dirname, process.env.NODE_ENV === 'production' ? '.' : 'dist');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_tR3PYbcVNZZ796tH88S4VQ2u');

// Log Stripe initialization status
console.log('Stripe initialized with key:', process.env.STRIPE_SECRET_KEY ? 'From environment variable' : 'Using fallback test key');

// Initialize MongoDB connection
let isConnected = false;

const CLAIM_COOLDOWN_MINUTES = 60; // Set to 60 minutes (1 hour)

// Constants for coupon generation
const COUPON_TIME_WINDOW_MINUTES = 10; // Time window for different coupons
const COUPON_COOLDOWN_MINUTES = 60; // Cooldown period for same user

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

        // Updated connection options with longer timeouts
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 60000, // Increased to 60 seconds
            socketTimeoutMS: 60000, // Increased to 60 seconds
            connectTimeoutMS: 60000, // Increased to 60 seconds
            heartbeatFrequencyMS: 10000,
            retryWrites: true,
            w: 'majority'
        });

        // Test the connection
        await mongoose.connection.db.admin().ping();

        isConnected = true;
        console.log('Successfully connected to MongoDB');
        console.log('MongoDB connection state:', mongoose.connection.readyState);

        // Use findOne instead of countDocuments to check for coupons
        try {
            const existingCoupon = await Coupon.findOne().lean();
            console.log(`Coupons in database: ${existingCoupon ? 'Yes' : 'No'}`);

            // Seed coupons if none exist
            if (!existingCoupon) {
                console.log('No coupons found, initiating seed process...');
                await seedCoupons();
            }
        } catch (findError) {
            console.error('Error checking for coupons:', findError);
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
            'http://localhost:5174',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:5174',
            'http://127.0.0.1:3000',
            'https://coupon-dis.onrender.com',
            process.env.CLIENT_URL
        ].filter(Boolean);

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Cookie', 'Set-Cookie'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 600 // Cache preflight request for 10 minutes
}));

// Add pre-flight handling
app.options('*', cors());

// Parse cookies and JSON body
app.use(cookieParser());
app.use(express.json());

// Add rate limiting middleware
const couponLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Increased from 1 to 5 to allow for testing
    message: {
        error: 'Too many coupon claims from this IP, please try again later.',
        retryAfter: 60 * 60 // 1 hour in seconds
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: true, // Don't count failed requests
    keyGenerator: (req) => {
        // Use IP address as the key, but allow for testing
        const ip = req.ip || req.connection.remoteAddress;
        console.log('Rate limiter key (IP):', ip);
        return ip;
    },
    handler: (req, res, next, options) => {
        console.log('Rate limit exceeded for IP:', req.ip);
        res.status(429).json(options.message);
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
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
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
        const isLocalhost = req.headers.origin?.includes('localhost');
        const cookieOptions = {
            maxAge: 86400000, // 24 hours
            httpOnly: true,
            secure: !isLocalhost, // Only require secure in production
            sameSite: isLocalhost ? 'lax' : 'none',
            path: '/'
        };
        res.cookie('sessionId', sessionId, cookieOptions);
        req.cookies.sessionId = sessionId;
        console.log('New session cookie set:', sessionId);
    } else {
        console.log('Existing session found:', req.cookies.sessionId);
    }
    next();
});

// Connection check middleware
app.use(async (req, res, next) => {
    if (!isConnected) {
        try {
            await connectToMongoDB();
            if (!isConnected) {
                return res.status(503).json({
                    error: 'Database connection not available, please try again',
                    retryAfter: 5
                });
            }
        } catch (error) {
            console.error('Connection middleware error:', error);
            return res.status(503).json({
                error: 'Database connection failed, please try again',
                retryAfter: 5
            });
        }
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

// Add a test endpoint to check coupon response
app.get('/api/test-coupon', async (req, res) => {
    // Set content type to JSON
    res.setHeader('Content-Type', 'application/json');

    try {
        // Find a coupon
        const coupon = await Coupon.findOne().lean();

        if (!coupon) {
            return res.status(404).json({ error: 'No coupons found' });
        }

        console.log('Test endpoint - Found coupon:', JSON.stringify(coupon));

        // Create a simple response with all fields
        const response = {
            id: coupon._id.toString(),
            code: coupon.code,
            description: coupon.description,
            discount: coupon.discount,
            expiresAt: coupon.expiresAt,
            duration: coupon.duration,
            duration_in_months: coupon.duration_in_months,
            maxRedemptions: coupon.maxRedemptions,
            timesRedeemed: coupon.timesRedeemed,
            active: coupon.active
        };

        console.log('Test endpoint - Sending response:', JSON.stringify(response));

        return res.json(response);
    } catch (error) {
        console.error('Test endpoint error:', error);
        return res.status(500).json({ error: 'Test endpoint error' });
    }
});

// Add a new test endpoint specifically for our test
app.get('/api/test-coupon-json', async (req, res) => {
    // Set content type to JSON
    res.setHeader('Content-Type', 'application/json');

    try {
        // Find a coupon
        const coupon = await Coupon.findOne().lean();

        if (!coupon) {
            return res.status(404).json({ error: 'No coupons found' });
        }

        console.log('Test JSON endpoint - Found coupon:', JSON.stringify(coupon));

        // Create a simple response with all fields
        const response = {
            id: coupon._id.toString(),
            code: coupon.code,
            description: coupon.description,
            discount: coupon.discount,
            expiresAt: coupon.expiresAt,
            duration: coupon.duration,
            duration_in_months: coupon.duration_in_months,
            maxRedemptions: coupon.maxRedemptions,
            timesRedeemed: coupon.timesRedeemed,
            active: coupon.active
        };

        console.log('Test JSON endpoint - Sending response:', JSON.stringify(response));

        return res.json(response);
    } catch (error) {
        console.error('Test JSON endpoint error:', error);
        return res.status(500).json({ error: 'Test endpoint error' });
    }
});

// Serve static files from the dist directory
app.use(express.static(distPath));

// Function to generate a unique coupon code
const generateUniqueCouponCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const length = 8;
    let code;
    do {
        code = '';
        for (let i = 0; i < length; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
    } while (code.includes('0') || code.includes('O')); // Avoid confusing characters
    return code;
};

// Function to create a new random coupon
const createRandomCoupon = async () => {
    const discounts = [10, 15, 20, 25, 30, 35, 40, 45, 50];
    const randomDiscount = discounts[Math.floor(Math.random() * discounts.length)];
    const uniqueId = generateUniqueCouponCode();

    try {
        // Try to create a Stripe coupon first
        let stripeCoupon;
        try {
            stripeCoupon = await stripe.coupons.create({
                duration: 'repeating',
                duration_in_months: 3,
                percent_off: randomDiscount,
                id: uniqueId,
                max_redemptions: 1 // Limit to 1 redemption per coupon
            });
            console.log(`Stripe coupon created: ${stripeCoupon.id}`);
        } catch (stripeError) {
            console.log('Using local coupon due to Stripe error:', stripeError.message);
        }

        // Create local coupon
        const coupon = new Coupon({
            code: stripeCoupon ? stripeCoupon.id : uniqueId,
            description: `Save ${randomDiscount}% on your purchase`,
            discount: randomDiscount,
            stripeId: stripeCoupon ? stripeCoupon.id : uniqueId,
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
            duration: 'repeating',
            duration_in_months: 3,
            maxRedemptions: 1, // Limit to 1 redemption per coupon
            timesRedeemed: 0,
            active: true
        });

        await coupon.save();
        return coupon;
    } catch (error) {
        console.error('Error creating random coupon:', error);
        throw error;
    }
};

// Function to check if user has ever claimed a specific coupon
const hasUserClaimedCoupon = async (ipAddress, sessionId, couponId) => {
    const claim = await CouponClaim.findOne({
        couponId,
        $or: [{ ipAddress }, { sessionId }]
    });
    return !!claim;
};

// Modified claim coupon endpoint
app.post('/api/claim-coupon', async (req, res) => {
    try {
        const { ipAddress, sessionId } = req.body;

        if (!ipAddress || !sessionId) {
            return res.status(400).json({ error: 'IP address and session ID are required' });
        }

        // Check if user can claim a coupon (cooldown period)
        const canClaim = await canUserClaimCoupon(ipAddress, sessionId);
        if (!canClaim) {
            return res.status(429).json({
                error: 'Please wait an hour before claiming another coupon',
                nextAvailableTime: new Date(Date.now() + COUPON_COOLDOWN_MINUTES * 60000)
            });
        }

        // Create a new random coupon
        const selectedCoupon = await createRandomCoupon();

        // Create coupon claim record
        const claim = new CouponClaim({
            ipAddress,
            sessionId,
            couponId: selectedCoupon._id,
            claimedAt: new Date()
        });
        await claim.save();

        // Update coupon redemption count
        selectedCoupon.timesRedeemed += 1;
        await selectedCoupon.save();

        res.json({
            success: true,
            coupon: {
                code: selectedCoupon.code,
                description: selectedCoupon.description,
                discount: selectedCoupon.discount,
                expiresAt: selectedCoupon.expiresAt
            }
        });

    } catch (error) {
        console.error('Error claiming coupon:', error);
        res.status(500).json({ error: 'Failed to claim coupon' });
    }
});

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

// Modify the seedCoupons function to create random coupons
async function seedCoupons() {
    try {
        // Use findOne() instead of countDocuments() to avoid timeout
        const existingCoupons = await Coupon.find().lean();

        if (existingCoupons.length === 0) {
            console.log('No coupons found, generating random coupons...');

            // Generate 10 random coupons with different discounts
            const discounts = [10, 15, 20, 25, 30, 35, 40, 45, 50];
            const coupons = [];

            for (let i = 0; i < 10; i++) {
                const randomDiscount = discounts[Math.floor(Math.random() * discounts.length)];
                const uniqueId = `SAVE${randomDiscount}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

                try {
                    // Try to create a Stripe coupon first
                    let stripeCoupon;
                    try {
                        stripeCoupon = await stripe.coupons.create({
                            duration: 'repeating',
                            duration_in_months: 3,
                            percent_off: randomDiscount,
                            id: uniqueId,
                            max_redemptions: 100
                        });
                        console.log(`Stripe coupon created: ${stripeCoupon.id}`);
                    } catch (stripeError) {
                        console.log('Using local coupon due to Stripe error:', stripeError.message);
                    }

                    // Create local coupon
                    const coupon = new Coupon({
                        code: stripeCoupon ? stripeCoupon.id : uniqueId,
                        description: `Save ${randomDiscount}% on your purchase`,
                        discount: randomDiscount,
                        stripeId: stripeCoupon ? stripeCoupon.id : uniqueId,
                        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
                        duration: 'repeating',
                        duration_in_months: 3,
                        maxRedemptions: 100,
                        timesRedeemed: 0,
                        active: true
                    });

                    coupons.push(coupon);
                } catch (error) {
                    console.error('Error creating coupon:', error);
                }
            }

            // Save all coupons
            if (coupons.length > 0) {
                await Coupon.insertMany(coupons);
                console.log(`Successfully created ${coupons.length} random coupons`);
            }
        } else {
            console.log(`Found ${existingCoupons.length} existing coupons, skipping seed`);
        }
    } catch (error) {
        console.error('Error seeding coupons:', error);
    }
} 