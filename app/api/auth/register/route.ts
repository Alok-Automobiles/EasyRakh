import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/mongodb';
import { generateToken } from '@/lib/auth';
import { z } from 'zod';
import { checkRateLimit, rateLimitConfigs } from '@/lib/rateLimit';

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firmTitle: z.string().default(''),
  gstNumber: z.string().default(''),
  firmPhone: z.string().default(''),
  firmEmail: z.union([z.string().email('Invalid firm email address'), z.literal('')]).default(''),
  firmAddress: z.string().default(''),
});

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, rateLimitConfigs.auth);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    const db = await getDb();
    const usersCollection = db.collection('users');

    const existingUser = await usersCollection.findOne({
      email: validatedData.email.toLowerCase(),
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(validatedData.password, 10);

    const userData: any = {
      name: validatedData.name,
      email: validatedData.email.toLowerCase(),
      password: hashedPassword,
      createdAt: new Date(),
    };

    if (validatedData.firmTitle?.trim()) userData.firmTitle = validatedData.firmTitle.trim();
    if (validatedData.gstNumber?.trim()) userData.gstNumber = validatedData.gstNumber.trim();
    if (validatedData.firmPhone?.trim()) userData.firmPhone = validatedData.firmPhone.trim();
    if (validatedData.firmEmail?.trim()) userData.firmEmail = validatedData.firmEmail.trim();
    if (validatedData.firmAddress?.trim()) userData.firmAddress = validatedData.firmAddress.trim();

    const result = await usersCollection.insertOne(userData);

    const token = generateToken({
      userId: result.insertedId.toString(),
      email: validatedData.email.toLowerCase(),
    });

    const response = NextResponse.json(
      {
        message: 'User created successfully',
        user: {
          id: result.insertedId.toString(),
          name: validatedData.name,
          email: validatedData.email.toLowerCase(),
          firmTitle: validatedData.firmTitle?.trim() || undefined,
          gstNumber: validatedData.gstNumber?.trim() || undefined,
          firmPhone: validatedData.firmPhone?.trim() || undefined,
          firmEmail: validatedData.firmEmail?.trim() || undefined,
          firmAddress: validatedData.firmAddress?.trim() || undefined,
        },
      },
      { status: 201 }
    );

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

