'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';

type ThemeToggleProps = {
  className?: string;
  surface?: 'default' | 'nav';
};

export default function ThemeToggle({ className, surface = 'default' }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === 'dark';
  const label = mounted ? (isDark ? 'Switch to light mode' : 'Switch to dark mode') : 'Toggle theme';
  const controlledTheme = mounted ? resolvedTheme : 'light';

  if (surface === 'nav') {
    return (
      <AnimatedThemeToggler
        theme={controlledTheme}
        onThemeChange={setTheme}
        aria-label={label}
        aria-pressed={mounted ? isDark : undefined}
        title={label}
        suppressHydrationWarning
        duration={500}
        variant="circle"
        className={cn(
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 [&_svg]:h-4 [&_svg]:w-4',
          className,
        )}
      />
    );
  }

  return (
    <AnimatedThemeToggler
      theme={controlledTheme}
      onThemeChange={setTheme}
      aria-label={label}
      aria-pressed={mounted ? isDark : undefined}
      title={label}
      suppressHydrationWarning
      duration={500}
      variant="circle"
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:h-4 [&_svg]:w-4',
        className,
      )}
    />
  );
}
