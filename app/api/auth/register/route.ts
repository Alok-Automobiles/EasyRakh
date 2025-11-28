import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/mongodb';
import { generateToken } from '@/lib/auth';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firmTitle: z.string().min(1, 'Firm title is required'),
  gstNumber: z.string().min(1, 'GST number is required'),
  firmPhone: z.string().min(1, 'Phone number is required'),
  firmEmail: z.string().email('Invalid firm email address'),
  firmAddress: z.string().min(1, 'Address is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    const db = await getDb();
    const usersCollection = db.collection('users');

    // Check if user already exists
    const existingUser = await usersCollection.findOne({
      email: validatedData.email.toLowerCase(),
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);

    // Create user
    const result = await usersCollection.insertOne({
      name: validatedData.name,
      email: validatedData.email.toLowerCase(),
      password: hashedPassword,
      firmTitle: validatedData.firmTitle,
      gstNumber: validatedData.gstNumber,
      firmPhone: validatedData.firmPhone,
      firmEmail: validatedData.firmEmail,
      firmAddress: validatedData.firmAddress,
      createdAt: new Date(),
    });

    // Generate token
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
          firmTitle: validatedData.firmTitle,
          gstNumber: validatedData.gstNumber,
          firmPhone: validatedData.firmPhone,
          firmEmail: validatedData.firmEmail,
          firmAddress: validatedData.firmAddress,
        },
      },
      { status: 201 }
    );

    // Set cookie
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
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

