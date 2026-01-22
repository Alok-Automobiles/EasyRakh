import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import redis from '@/lib/redis';
import { getDb } from '@/lib/mongodb';
import { rateLimitConfigs, checkRateLimit } from '@/lib/rateLimit';
import { sendOtpEmail } from '@/lib/email';

const requestSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 600; 
const OTP_KEY_PREFIX = 'pwd_reset_otp';
const ATTEMPT_KEY_PREFIX = 'pwd_reset_attempts';

function generateOtp(length: number) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, rateLimitConfigs.auth);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { email } = requestSchema.parse(body);
    const normalizedEmail = email.toLowerCase();

    const db = await getDb();
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ email: normalizedEmail });
    if (!user) {
      return NextResponse.json({ message: 'If the email exists, a code has been sent.' }, { status: 200 });
    }

    const otp = generateOtp(OTP_LENGTH);
    const hashedOtp = await bcrypt.hash(otp, 10);
    const otpKey = `${OTP_KEY_PREFIX}:${normalizedEmail}`;
    const attemptKey = `${ATTEMPT_KEY_PREFIX}:${normalizedEmail}`;

    await redis.set(otpKey, hashedOtp, 'EX', OTP_TTL_SECONDS);
    await redis.del(attemptKey);

    await sendOtpEmail(normalizedEmail, otp);

    return NextResponse.json({ message: 'If the email exists, a code has been sent.' }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }

    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

