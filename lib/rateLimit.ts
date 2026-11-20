import { NextRequest, NextResponse } from 'next/server';
import redis from './redis';

// Increment and expiry must succeed together so counters cannot become permanent.
const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (request: NextRequest) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60000, // 1 minute
  maxRequests: 100,
};

/**
 * Rate limiting check using a Redis fixed window
 * Returns null if request should proceed, or a NextResponse with 429 if rate limited
 */
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<NextResponse | null> {
  try {
    const { windowMs, maxRequests, keyGenerator } = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    // The deployment proxy must overwrite forwarding headers with the client IP.
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')?.trim()
      || 'unknown';
    let userId = `ip:${clientIp}`;
    try {
      const token = request.cookies.get('token')?.value;
      if (token || request.headers.get('authorization')?.startsWith('Bearer ')) {
        const { getUserIdFromRequest } = await import('./auth');
        const authenticatedUserId = getUserIdFromRequest(request);
        if (authenticatedUserId) userId = `user:${authenticatedUserId}`;
      }
    } catch {
    }

    const key = keyGenerator
      ? keyGenerator(request)
      : `rateLimit:${userId}:${request.nextUrl.pathname}`;

    const [current, ttl] = await redis.eval(
      RATE_LIMIT_SCRIPT, 1, key, windowMs
    ) as [number, number];
    const resetTime = Date.now() + (ttl > 0 ? ttl : windowMs);

    if (current > maxRequests) {
      const retryAfter = Math.ceil((ttl > 0 ? ttl : windowMs) / 1000);
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: `Rate limit exceeded. Please try again after ${retryAfter} seconds.`,
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(resetTime).toISOString(),
          },
        }
      );
    }

    return null;
  } catch (error) {
    console.warn('Rate limit check failed, allowing request:', error);
    return null;
  }
}

/**
 * Helper to add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  config: RateLimitConfig,
  current: number
): NextResponse {
  const remaining = Math.max(0, config.maxRequests - current);
  const resetTime = Date.now() + config.windowMs;
  
  response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  response.headers.set('X-RateLimit-Reset', new Date(resetTime).toISOString());
  
  return response;
}

/**
 * Predefined rate limit configurations for different endpoint types
 */
export const rateLimitConfigs = {
  auth: {
    windowMs: 60000, // 1 minute
    maxRequests: 5,
  },
  read: {
    windowMs: 60000, // 1 minute
    maxRequests: 100,
  },
  write: {
    windowMs: 60000, // 1 minute
    maxRequests: 30,
  },
  upload: {
    windowMs: 60000, // 1 minute
    maxRequests: 10,
  },
  default: {
    windowMs: 60000, // 1 minute
    maxRequests: 100,
  },
};

