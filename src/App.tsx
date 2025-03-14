import React, { useState, useEffect } from 'react';
import { Gift, AlertCircle } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';

// Define API URL based on environment
const API_URL = import.meta.env.VITE_API_URL || 'https://coupon-dis.onrender.com';
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

console.log('Current API URL:', API_URL);
console.log('Environment:', import.meta.env.MODE);
console.log('Is localhost:', isLocalhost);
console.log('All environment variables:', import.meta.env);

interface Coupon {
  code: string;
  description: string;
  discount: number;
  expiresAt: string;
  duration: 'once' | 'repeating' | 'forever';
  duration_in_months?: number;
  maxRedemptions?: number;
  timesRedeemed: number;
  active: boolean;
}

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [lastClaimTime, setLastClaimTime] = useState<number | null>(null);
  const [retries, setRetries] = useState(0);
  const [retryTimeout, setRetryTimeout] = useState<NodeJS.Timeout | null>(null);
  const MAX_RETRIES = 3;

  useEffect(() => {
    // Set session ID cookie if not exists
    if (!document.cookie.includes('sessionId')) {
      const sessionId = Math.random().toString(36).substring(2);
      const cookieOptions = isLocalhost
        ? `max-age=86400; path=/; SameSite=Lax`
        : `max-age=86400; path=/; SameSite=None; Secure`;
      document.cookie = `sessionId=${sessionId}; ${cookieOptions}`;
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

  // Function to clear any existing retry timeout
  const clearRetryTimeout = () => {
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      setRetryTimeout(null);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => clearRetryTimeout();
  }, []);

  const claimCoupon = async (isRetry = false) => {
    // Clear any existing retry timeout
    clearRetryTimeout();

    // If not a retry, reset the retry counter
    if (!isRetry) {
      setRetries(0);
    }

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
      console.log('Attempt number:', retries + 1);

      const response = await fetch(`${API_URL}/api/coupons/next`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': window.location.origin
        },
        mode: 'cors'
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries([...response.headers.entries()]));

      const responseText = await response.text();
      console.log('Response body:', responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        throw new Error('Invalid response format from server');
      }

      if (!response.ok) {
        console.error('Error response from server:', data);

        // Check if we should retry based on the error
        if (retries < MAX_RETRIES &&
          (response.status === 500 || response.status === 503 || response.status === 429) &&
          data.retryAfter) {
          const retryAfterSeconds = data.retryAfter;
          console.log(`Will retry in ${retryAfterSeconds} seconds (attempt ${retries + 1}/${MAX_RETRIES})`);

          setError(`Temporary error. Retrying in ${retryAfterSeconds} seconds... (${retries + 1}/${MAX_RETRIES})`);

          // Set up retry
          const timeout = setTimeout(() => {
            setRetries(prev => prev + 1);
            claimCoupon(true);
          }, retryAfterSeconds * 1000);

          setRetryTimeout(timeout);
          setLoading(false);
          return;
        }

        throw new Error(data.error || 'Failed to claim coupon');
      }

      console.log('Coupon data received:', data);

      // Create a complete coupon object with default values for missing fields
      const completeCoupon: Coupon = {
        code: data.code || 'UNKNOWN',
        description: data.description || 'Discount coupon',
        discount: data.discount || 0,
        expiresAt: data.expiresAt || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        duration: data.duration || 'once',
        duration_in_months: data.duration_in_months,
        maxRedemptions: data.maxRedemptions,
        timesRedeemed: data.timesRedeemed || 0,
        active: data.active !== undefined ? data.active : true
      };

      setCoupon(completeCoupon);
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

  const formatExpiryDate = (date: string) => {
    const expiryDate = new Date(date);
    return expiryDate.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDuration = (coupon: Coupon) => {
    if (coupon.duration === 'once') return 'One-time use';
    if (coupon.duration === 'forever') return 'Never expires';
    if (coupon.duration === 'repeating' && coupon.duration_in_months) {
      return `Valid for ${coupon.duration_in_months} months`;
    }
    return '';
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
            <div className="mt-4 text-sm text-gray-600">
              <p>Expires: {formatExpiryDate(coupon.expiresAt)}</p>
              <p>{formatDuration(coupon)}</p>
              {coupon.maxRedemptions && (
                <p>
                  Uses: {coupon.timesRedeemed} / {coupon.maxRedemptions}
                </p>
              )}
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 text-sm sm:text-base">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <button
          onClick={() => claimCoupon(false)}
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