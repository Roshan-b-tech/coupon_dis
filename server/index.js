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
    console.error('Error seeding coupons:', error);
  }
}

// Middleware
app.use(cors({
  origin: ['https://freecoupon60min.netlify.app', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Cookie']
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
    const sessionId = req.cookies.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'No session ID found' });
    }

    console.log('Session ID:', sessionId);

    // Check if user has claimed a coupon in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentClaim = await Coupon.findOne({
      claimedBy: sessionId,
      claimedAt: { $gt: oneHourAgo }
    });

    if (recentClaim) {
      return res.status(400).json({ error: 'You can only claim one coupon per hour' });
    }

    // Find an unclaimed coupon
    const coupon = await Coupon.findOne({ claimedBy: null });
    if (!coupon) {
      return res.status(404).json({ error: 'No coupons available' });
    }

    // Update the coupon with the user's session ID
    coupon.claimedBy = sessionId;
    coupon.claimedAt = new Date();
    await coupon.save();

    res.json({ code: coupon.code });
  } catch (error) {
    console.error('Error claiming coupon:', error);
    res.status(500).json({ error: 'Failed to claim coupon' });
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