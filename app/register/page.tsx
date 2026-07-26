'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
} from 'lucide-react';
import AuthScaffold from '@/components/auth/AuthScaffold';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

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
  const [showPassword, setShowPassword] = useState(false);
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
  const password = useWatch({ control: form.control, name: 'password' }) ?? '';

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
    <AuthScaffold
      mode="register"
      eyebrow="Start simply"
      title="Create your account"
      description="Set up your secure EasyRakh workspace. Business details are optional and can be added later."
      alternateText="Already use EasyRakh?"
      alternateLabel="Sign in"
      alternateHref="/login"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold">
                    Full name <span className="text-destructive">*</span>
                  </FormLabel>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-4 top-1/2 z-10 size-[18px] -translate-y-1/2 text-muted-foreground" />
                    <FormControl>
                      <Input
                        type="text"
                        autoComplete="name"
                        placeholder="Your full name"
                        className="h-12 rounded-xl bg-background/65 pl-11 shadow-none"
                        {...field}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-bold">
                    Email address <span className="text-destructive">*</span>
                  </FormLabel>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 z-10 size-[18px] -translate-y-1/2 text-muted-foreground" />
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        className="h-12 rounded-xl bg-background/65 pl-11 shadow-none"
                        {...field}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-bold">
                  Password <span className="text-destructive">*</span>
                </FormLabel>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 z-10 size-[18px] -translate-y-1/2 text-muted-foreground" />
                  <FormControl>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Create a secure password"
                      className="h-12 rounded-xl bg-background/65 pl-11 pr-12 shadow-none"
                      {...field}
                    />
                  </FormControl>
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                  </button>
                </div>
                <div
                  className={cn(
                    'mt-2 flex items-center gap-2 text-xs font-medium',
                    password.length >= 6 ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-4 items-center justify-center rounded-full border',
                      password.length >= 6
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border',
                    )}
                  >
                    {password.length >= 6 && <Check className="size-3" />}
                  </span>
                  Use at least 6 characters
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <details className="group overflow-hidden rounded-2xl border border-border bg-background/45">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
              <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <Building2 className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-foreground">Add business details</span>
                <span className="block text-xs text-muted-foreground">Optional—you can complete this later</span>
              </span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>

            <div className="grid gap-4 border-t border-border px-4 py-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firmTitle"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="text-xs font-semibold">Firm name</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Your business name"
                        className="h-10 rounded-xl bg-card shadow-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gstNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">GST number</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="GST number"
                        className="h-10 rounded-xl bg-card shadow-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="firmPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Phone number</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="Business phone"
                        className="h-10 rounded-xl bg-card shadow-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="firmEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Firm email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="Business email"
                        className="h-10 rounded-xl bg-card shadow-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="firmAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Address</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Business address"
                        rows={1}
                        className="min-h-10 resize-none rounded-xl bg-card text-sm shadow-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </details>

          <Button
            type="submit"
            disabled={loading}
            size="lg"
            className="group h-12 w-full rounded-xl px-7 text-[15px] shadow-[0_10px_24px_rgba(16,185,129,0.22)] sm:w-56"
          >
            {loading ? 'Creating account...' : 'Create account'}
            {!loading && (
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground lg:hidden">
            Already have an account?{' '}
            <Link href="/login" className="font-bold text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </Form>
    </AuthScaffold>
  );
}
