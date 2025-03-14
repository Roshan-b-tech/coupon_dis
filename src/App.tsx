import React, { useState, useEffect } from 'react';
import { Gift, AlertCircle } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';

// Define API URL based on environment
const API_URL = 'https://coupon-dis.onrender.com';
console.log('Current API URL:', API_URL);

interface Coupon {
  code: string;
  description: string;
  discount: number;
}

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [lastClaimTime, setLastClaimTime] = useState<number | null>(null);

  useEffect(() => {
    // Set session ID cookie if not exists
    if (!document.cookie.includes('sessionId')) {
      const sessionId = Math.random().toString(36).substring(2);
      document.cookie = `sessionId=${sessionId}; max-age=86400; path=/; SameSite=None; Secure`;
      console.log('Set sessionId cookie:', sessionId);
    } else {
      console.log('Existing sessionId cookie found');
    }

    // Check if there's a last claim time in localStorage
    const storedLastClaimTime = localStorage.getItem('lastClaimTime');
    if (storedLastClaimTime) {
      setLastClaimTime(parseInt(storedLastClaimTime));
    }
  }, []);

  const claimCoupon = async () => {
    // Check if user has claimed in the last hour
    if (lastClaimTime && Date.now() - lastClaimTime < 3600000) {
      const timeLeft = Math.ceil((3600000 - (Date.now() - lastClaimTime)) / 60000);
      const errorMessage = `You can only claim one coupon per hour. Please wait ${timeLeft} minutes before claiming another coupon.`;
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log('Current cookies:', document.cookie);
      console.log('Fetching from:', API_URL);

      const response = await fetch(`${API_URL}/api/coupons/next`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to claim coupon');
      }

      const data = await response.json();
      setCoupon(data);
      setLastClaimTime(Date.now());
      localStorage.setItem('lastClaimTime', Date.now().toString());
      toast.success('Coupon claimed successfully!');
    } catch (err) {
      console.error('Error claiming coupon:', err);
      setError(err instanceof Error ? err.message : 'Failed to claim coupon');
      toast.error(err instanceof Error ? err.message : 'Failed to claim coupon');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center p-4 sm:p-6 md:p-8">
      <Toaster position="top-center" />

      <div className="w-full max-w-[95%] sm:max-w-md bg-white rounded-xl shadow-xl p-4 sm:p-6 md:p-8">
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex justify-center mb-3 sm:mb-4">
            <Gift className="w-12 h-12 sm:w-16 sm:h-16 text-indigo-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Coupon Distribution
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Claim your exclusive discount coupon below
          </p>
        </div>

        {coupon ? (
          <div className="bg-indigo-50 rounded-lg p-4 sm:p-6 text-center mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-indigo-900 mb-2">
              Your Coupon
            </h2>
            <div className="bg-white rounded-md p-3 sm:p-4 mb-2 sm:mb-3 shadow-sm">
              <p className="text-xl sm:text-2xl font-mono font-bold text-indigo-600 break-all">
                {coupon.code}
              </p>
            </div>
            <p className="text-sm sm:text-base text-indigo-700 mb-2">{coupon.description}</p>
            <p className="text-base sm:text-lg font-semibold text-indigo-900">
              {coupon.discount}% OFF
            </p>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 text-sm sm:text-base">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <button
          onClick={claimCoupon}
          disabled={loading || !!coupon}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors
            ${loading || coupon
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
        >
          {loading ? 'Claiming...' : coupon ? 'Coupon Claimed' : 'Claim Coupon'}
        </button>

        {!error && !coupon && (
          <p className="text-sm text-gray-500 text-center mt-4">
            You can claim one coupon per hour
          </p>
        )}
      </div>
    </div>
  );
}

export default App;