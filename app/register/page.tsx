'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'motion/react'
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

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      firmTitle: '',
      gstNumber: '',
      firmPhone: '',
      firmEmail: '',
      firmAddress: '',
    },
  });

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    try {
      const submitData = {
        ...data,
        firmTitle: data.firmTitle?.trim() || undefined,
        gstNumber: data.gstNumber?.trim() || undefined,
        firmPhone: data.firmPhone?.trim() || undefined,
        firmEmail: data.firmEmail?.trim() || undefined,
        firmAddress: data.firmAddress?.trim() || undefined,
      };

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success('Registration successful!');
        router.push('/dashboard');
        router.refresh();
      } else {
        toast.error(result.error || 'Registration failed');
      }
    } catch {
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.3 }}
      exit={{ opacity: 0 }}
    >
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-4 px-3 sm:py-6 sm:px-4 lg:px-6">
        <Card className="w-full max-w-5xl">
          <CardHeader className="pb-3 sm:pb-4">
            <div className="flex justify-center mb-3 sm:mb-4">
              <Image
                src="/logo.png"
                alt="EasyRakh logo"
                width={60}
                height={60}
        
              />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold text-center">
              Create your account
            </CardTitle>
            <CardDescription className="text-center text-xs sm:text-sm">
              Or{' '}
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                sign in to your existing account
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-4 sm:pb-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {/* Personal Information Section - Required Fields */}
                  <div className="space-y-3 sm:space-y-4 p-4 sm:p-5 bg-blue-50/50 border-2 border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 pb-2 border-b-2 border-blue-300">
                      <h3 className="text-sm font-bold text-blue-700">Required Information</h3>
                      <span className="text-xs font-semibold text-blue-600 bg-blue-200 px-2 py-0.5 rounded">* Required</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm font-semibold">
                            Full Name <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              autoComplete="name"
                              placeholder="Full Name"
                              className="h-9 sm:h-10 text-sm border-blue-300 focus:border-blue-500"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm font-semibold">
                            Email address <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              autoComplete="email"
                              placeholder="Email address"
                              className="h-9 sm:h-10 text-sm border-blue-300 focus:border-blue-500"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm font-semibold">
                            Password <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              placeholder="Password"
                              className="h-9 sm:h-10 text-sm border-blue-300 focus:border-blue-500"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Firm Information Section - Optional Fields */}
                  <div className="space-y-3 sm:space-y-4 p-4 sm:p-5 bg-gray-50/50 border-2 border-dashed border-gray-300 rounded-lg">
                    <div className="flex items-center gap-2 pb-2 border-b-2 border-dashed border-gray-400">
                      <h3 className="text-sm font-semibold text-gray-600">Firm Information</h3>
                      <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded">Optional</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="firmTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm text-gray-600">
                            Firm Title
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="Your Firm Name"
                              className="h-9 sm:h-10 text-sm border-gray-300 focus:border-gray-400 bg-white/80"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <FormField
                        control={form.control}
                        name="gstNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs sm:text-sm text-gray-600">
                              GST Number
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                placeholder="GST Number"
                                className="h-9 sm:h-10 text-sm border-gray-300 focus:border-gray-400 bg-white/80"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="firmPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs sm:text-sm text-gray-600">
                              Phone Number
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="tel"
                                placeholder="Phone Number"
                                className="h-9 sm:h-10 text-sm border-gray-300 focus:border-gray-400 bg-white/80"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="firmEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm text-gray-600">
                            Firm Email
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="Firm Email Address"
                              className="h-9 sm:h-10 text-sm border-gray-300 focus:border-gray-400 bg-white/80"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="firmAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm text-gray-600">
                            Address
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Firm Address"
                              rows={2}
                              className="text-sm resize-none border-gray-300 focus:border-gray-400 bg-white/80"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                <div className="flex justify-center mt-2 sm:mt-4">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-auto min-w-[200px] sm:min-w-[250px] h-9 sm:h-10 text-sm font-medium px-6 sm:px-8"
                  >
                    {loading ? 'Creating account...' : 'Create account'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

