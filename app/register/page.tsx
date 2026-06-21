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

type RegisterForm = z.input<typeof registerSchema>;

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
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground py-4 px-3 sm:py-6 sm:px-4 lg:px-6">
        <Card className="w-full max-w-5xl">
          <CardHeader className="pb-3 sm:pb-4">
            <div className="flex justify-center mb-3 sm:mb-4">
              <Image
                src="/logo.png"
                alt="EasyRakh logo"
                width={60}
                height={60}
                className="theme-logo-surface rounded-xl p-1"
        
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
                  <div className="auth-form-section auth-form-section-required space-y-3 sm:space-y-4 p-4 sm:p-5 border-2 rounded-lg">
                    <div className="auth-form-section-header flex items-center gap-2 pb-2 border-b-2">
                      <h3 className="auth-form-section-title-accent text-sm font-bold">Required Information</h3>
                      <span className="auth-form-badge auth-form-badge-required text-xs font-semibold px-2 py-0.5 rounded">* Required</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="auth-form-label text-xs sm:text-sm font-semibold">
                            Full Name <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              autoComplete="name"
                              placeholder="Full Name"
                              className="auth-form-input h-9 sm:h-10 text-sm"
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
                          <FormLabel className="auth-form-label text-xs sm:text-sm font-semibold">
                            Email address <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              autoComplete="email"
                              placeholder="Email address"
                              className="auth-form-input h-9 sm:h-10 text-sm"
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
                          <FormLabel className="auth-form-label text-xs sm:text-sm font-semibold">
                            Password <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              placeholder="Password"
                              className="auth-form-input h-9 sm:h-10 text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Firm Information Section - Optional Fields */}
                  <div className="auth-form-section auth-form-section-optional space-y-3 sm:space-y-4 p-4 sm:p-5 border-2 rounded-lg">
                    <div className="auth-form-section-header flex items-center gap-2 pb-2 border-b-2 border-dashed">
                      <h3 className="auth-form-section-title text-sm font-semibold">Firm Information</h3>
                      <span className="auth-form-badge text-xs font-medium px-2 py-0.5 rounded">Optional</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="firmTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="auth-form-label-muted text-xs sm:text-sm">
                            Firm Title
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="Your Firm Name"
                              className="auth-form-input h-9 sm:h-10 text-sm"
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
                            <FormLabel className="auth-form-label-muted text-xs sm:text-sm">
                              GST Number
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                placeholder="GST Number"
                                className="auth-form-input h-9 sm:h-10 text-sm"
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
                            <FormLabel className="auth-form-label-muted text-xs sm:text-sm">
                              Phone Number
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="tel"
                                placeholder="Phone Number"
                                className="auth-form-input h-9 sm:h-10 text-sm"
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
                          <FormLabel className="auth-form-label-muted text-xs sm:text-sm">
                            Firm Email
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="Firm Email Address"
                              className="auth-form-input h-9 sm:h-10 text-sm"
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
                          <FormLabel className="auth-form-label-muted text-xs sm:text-sm">
                            Address
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Firm Address"
                              rows={2}
                              className="auth-form-input text-sm resize-none"
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
