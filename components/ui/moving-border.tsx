'use client';

import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

type MovingBorderProps = {
  children: React.ReactNode;
  /** Inner content wrapper (padding, bg) */
  className?: string;
  containerClassName?: string;
  /** Seconds per full rotation */
  duration?: number;
};

/**
 * Animated conic-gradient border (Aceternity-style). Inner area stays readable.
 */
export function MovingBorder({
  children,
  className,
  containerClassName,
  duration = 5,
}: MovingBorderProps) {
  return (
    <div className={cn('relative rounded-3xl p-[1.5px] shadow-lg shadow-emerald-500/10', containerClassName)}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <motion.div
          className="absolute left-1/2 top-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent_20%,#10b981_40%,#2dd4bf_50%,#10b981_60%,transparent_80%)] opacity-90"
          animate={{ rotate: 360 }}
          transition={{ duration, repeat: Infinity, ease: 'linear' }}
        />
      </div>
      <div
        className={cn(
          'relative h-full rounded-[calc(1.5rem-1px)] bg-white/95 shadow-inner backdrop-blur-md',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
