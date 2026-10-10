'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import AuthScaffold from '@/components/auth/AuthScaffold';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success('Login successful!');
        router.push('/dashboard');
        router.refresh();
      } else {
        toast.error(result.error || 'Login failed');
      }
    } catch {
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScaffold
      mode="login"
      eyebrow="Welcome back"
      title="Sign in to your account"
      description="Your sales, inventory, ledgers, and cash records are waiting for you."
      alternateText="New to EasyRakh?"
      alternateLabel="Create account"
      alternateHref="/register"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-bold">Email address</FormLabel>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 z-10 size-[18px] -translate-y-1/2 text-muted-foreground" />
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="h-12 rounded-xl bg-background/65 pl-11 pr-4 shadow-none"
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
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-3">
                  <FormLabel className="text-sm font-bold">Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-bold text-primary underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 z-10 size-[18px] -translate-y-1/2 text-muted-foreground" />
                  <FormControl>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
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
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            disabled={loading}
            size="lg"
            className="group mt-2 h-12 w-full rounded-xl px-7 text-[15px] shadow-[0_10px_24px_rgba(16,185,129,0.22)] sm:w-56"
          >
            {loading ? 'Signing in...' : 'Sign in'}
            {!loading && (
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground lg:hidden">
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="font-bold text-primary underline-offset-4 hover:underline"
            >
              Create one
            </Link>
          </p>
        </form>
      </Form>
    </AuthScaffold>
  );
}
