import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Coupon from './models/Coupon.js';
import CouponClaim from './models/CouponClaim.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize MongoDB connection
let isConnected = false;

const connectToMongoDB = async () => {
  if (isConnected) return;

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 60000, // Increase timeout to 60 seconds
      socketTimeoutMS: 60000,
      connectTimeoutMS: 60000,
      maxPoolSize: 50,
      minPoolSize: 10,
      maxIdleTimeMS: 60000
    });

    isConnected = true;
    console.log('Successfully connected to MongoDB');

    // Seed coupons after successful connection
    await seedCoupons();
  } catch (error) {
    console.error('MongoDB connection error:', error);
    isConnected = false;
    // Retry connection after 5 seconds
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
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

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

app.get('/api/coupons/next', async (req, res) => {
  if (!isConnected) {
    return res.status(503).json({ error: 'Database connection not available' });
  }

  try {
    const ipAddress = req.ip;
    const sessionId = req.cookies.sessionId;

    // Check if user has claimed a coupon in the last hour
    const lastClaim = await CouponClaim.findOne({
      $or: [
        { ipAddress, claimedAt: { $gte: new Date(Date.now() - 3600000) } },
        { sessionId, claimedAt: { $gte: new Date(Date.now() - 3600000) } }
      ]
    }).maxTimeMS(30000);

    if (lastClaim) {
      const timeLeft = Math.ceil((lastClaim.claimedAt.getTime() + 3600000 - Date.now()) / 60000);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Please wait ${timeLeft} minutes before claiming another coupon.`
      });
    }

    // Get next available coupon using round-robin approach
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      let coupon = await Coupon.findOneAndUpdate(
        { isAssigned: false },
        {
          isAssigned: true,
          assignedAt: new Date()
        },
        {
          new: true,
          sort: { assignedAt: 1, _id: 1 },
          maxTimeMS: 30000,
          session
        }
      );

      if (!coupon) {
        // If no unassigned coupons, reset the oldest assigned coupon
        coupon = await Coupon.findOneAndUpdate(
          {},
          {
            isAssigned: true,
            assignedAt: new Date()
          },
          {
            new: true,
            sort: { assignedAt: 1, _id: 1 },
            maxTimeMS: 30000,
            session
          }
        );
      }

      if (!coupon) {
        await session.abortTransaction();
        return res.status(404).json({ error: 'No coupons available' });
      }

      // Record the claim
      await CouponClaim.create([{
        ipAddress,
        sessionId,
        couponId: coupon._id,
      }], { session });

      await session.commitTransaction();

      res.json({
        code: coupon.code,
        description: coupon.description,
        discount: coupon.discount,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Error claiming coupon:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle all other routes by serving the index.html
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

// Start server and connect to MongoDB
const startServer = async () => {
  await connectToMongoDB();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch(console.error);