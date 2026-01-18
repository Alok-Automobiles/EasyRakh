import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import redis from '@/lib/redis';
import { getDb } from '@/lib/mongodb';
import { rateLimitConfigs, checkRateLimit } from '@/lib/rateLimit';

const requestSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().length(6, 'Invalid code'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

const OTP_KEY_PREFIX = 'pwd_reset_otp';
const ATTEMPT_KEY_PREFIX = 'pwd_reset_attempts';
const MAX_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, rateLimitConfigs.auth);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { email, otp, newPassword } = requestSchema.parse(body);
    const normalizedEmail = email.toLowerCase();

    const db = await getDb();
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ email: normalizedEmail });

    if (!user) {
      return NextResponse.json({ error: 'Invalid code or email' }, { status: 400 });
    }

    const otpKey = `${OTP_KEY_PREFIX}:${normalizedEmail}`;
    const attemptKey = `${ATTEMPT_KEY_PREFIX}:${normalizedEmail}`;

    const attempts = Number((await redis.get(attemptKey)) || 0);
    if (attempts >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: 'Too many attempts. Please request a new code.' }, { status: 429 });
    }

    const storedHash = await redis.get(otpKey);
    if (!storedHash) {
      return NextResponse.json({ error: 'Code expired or invalid' }, { status: 400 });
    }

    const otpMatch = await bcrypt.compare(otp, storedHash);
    if (!otpMatch) {
      await redis.incr(attemptKey);
      await redis.expire(attemptKey, 600); 
      return NextResponse.json({ error: 'Code expired or invalid' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword } }
    );

    await redis.del(otpKey);
    await redis.del(attemptKey);

    return NextResponse.json({ message: 'Password updated successfully' }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }

    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

