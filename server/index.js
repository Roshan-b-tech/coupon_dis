import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import Coupon from './models/Coupon.js';
import CouponClaim from './models/CouponClaim.js';

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
  } catch (error) {
    console.error('MongoDB connection error:', error);
    isConnected = false;
    setTimeout(connectToMongoDB, 5000);
  }
};

// Handle MongoDB connection events
mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', error);
  isConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
  isConnected = false;
  connectToMongoDB();
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

// Seed initial coupons if none exist
async function seedCoupons() {
  try {
    const count = await Coupon.countDocuments();
    if (count === 0) {
      console.log('No coupons found, seeding initial coupons');
      const coupons = [
        {
          code: 'SAVE10',
          description: 'Save 10% on your purchase',
          discount: 10,
          stripeId: 'SAVE10_' + Date.now(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
          duration: 'once',
          maxRedemptions: 100,
          timesRedeemed: 0,
          active: true
        },
        {
          code: 'SAVE15',
          description: 'Save 15% on your purchase',
          discount: 15,
          stripeId: 'SAVE15_' + Date.now(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          duration: 'once',
          maxRedemptions: 100,
          timesRedeemed: 0,
          active: true
        },
        {
          code: 'SAVE20',
          description: 'Save 20% on your purchase',
          discount: 20,
          stripeId: 'SAVE20_' + Date.now(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          duration: 'once',
          maxRedemptions: 100,
          timesRedeemed: 0,
          active: true
        },
        {
          code: 'SAVE25',
          description: 'Save 25% on your purchase',
          discount: 25,
          stripeId: 'SAVE25_' + Date.now(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          duration: 'once',
          maxRedemptions: 100,
          timesRedeemed: 0,
          active: true
        },
        {
          code: 'SAVE30',
          description: 'Save 30% on your purchase',
          discount: 30,
          stripeId: 'SAVE30_' + Date.now(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          duration: 'once',
          maxRedemptions: 100,
          timesRedeemed: 0,
          active: true
        },
      ];
      await Coupon.insertMany(coupons);
      console.log('Initial coupons seeded successfully');
    } else {
      console.log(`Found ${count} existing coupons`);
    }
  } catch (error) {
    console.error('Error seeding coupons:', error);
  }
}

// Middleware
app.use(cors({
  origin: ['https://freecoupon60min.netlify.app', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Cookie', 'Origin'],
  exposedHeaders: ['Set-Cookie'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Add OPTIONS handler for preflight requests
app.options('*', cors({
  origin: ['https://freecoupon60min.netlify.app', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Cookie', 'Origin'],
  exposedHeaders: ['Set-Cookie'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

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

// Serve static files from the dist directory
app.use(express.static(join(__dirname, '../dist')));

// Routes
app.get('/api/coupons/status', async (req, res) => {
  if (!isConnected) {
    return res.status(503).json({ error: 'Database connection not available' });
  }

  try {
    const coupons = await Coupon.find().sort({ assignedAt: 1 });
    res.json(coupons);
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/coupons/next', async (req, res) => {
  try {
    console.log('Received coupon claim request');
    console.log('Request headers:', req.headers);
    console.log('Request cookies:', req.cookies);
    console.log('Client IP:', req.ip);
    console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);

    const sessionId = req.cookies.sessionId;
    if (!sessionId) {
      console.log('No session ID found in cookies');
      return res.status(400).json({ error: 'No session ID found' });
    }

    console.log('Session ID:', sessionId);

    // Check if user has claimed a coupon in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    console.log('Checking for recent claims before:', oneHourAgo);

    const recentClaim = await CouponClaim.findOne({
      sessionId: sessionId,
      claimedAt: { $gt: oneHourAgo }
    });

    if (recentClaim) {
      console.log('Found recent claim:', recentClaim);
      return res.status(400).json({ error: 'You can only claim one coupon per hour' });
    }

    console.log('No recent claims found, searching for available coupon');

    // Find an unclaimed coupon
    const coupon = await Coupon.findOne({
      active: true,
      expiresAt: { $gt: new Date() },
      $or: [
        { maxRedemptions: null },
        { $expr: { $lt: ['$timesRedeemed', '$maxRedemptions'] } }
      ]
    });

    if (!coupon) {
      console.log('No available coupons found');
      return res.status(404).json({ error: 'No coupons available' });
    }

    console.log('Found available coupon:', coupon);

    // Create a claim record
    console.log('Creating claim record');
    const clientIp = req.headers['x-forwarded-for'] || req.ip;
    console.log('Using IP address:', clientIp);

    const claim = await CouponClaim.create({
      sessionId: sessionId,
      ipAddress: clientIp,
      couponId: coupon._id,
      claimedAt: new Date()
    });
    console.log('Claim record created:', claim);

    // Increment the coupon's redemption count
    console.log('Incrementing coupon redemption count');
    await Coupon.findByIdAndUpdate(
      coupon._id,
      { $inc: { timesRedeemed: 1 } },
      { new: true }
    );
    console.log('Coupon updated successfully');

    res.json({
      code: coupon.code,
      description: coupon.description,
      discount: coupon.discount,
      expiresAt: coupon.expiresAt,
      duration: coupon.duration,
      duration_in_months: coupon.duration_in_months
    });
  } catch (error) {
    console.error('Error claiming coupon:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      errors: error.errors // For validation errors
    });

    // Send more specific error message
    const errorMessage = error.name === 'ValidationError'
      ? 'Invalid data provided'
      : 'Failed to claim coupon';

    res.status(500).json({
      error: errorMessage,
      details: error.message
    });
  }
});

// Handle all other routes by serving the index.html
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

// Start server and connect to MongoDB
const startServer = async () => {
  try {
    await connectToMongoDB();

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Server environment: ${process.env.NODE_ENV}`);
      console.log('CORS origins:', ['https://freecoupon60min.netlify.app', 'http://localhost:5173']);
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