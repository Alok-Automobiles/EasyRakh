"use client";

import { useMotionValue, motion, useMotionTemplate } from "motion/react";
import React, { MouseEvent as ReactMouseEvent, useState } from "react";
import { CanvasRevealEffect } from "@/components/ui/canvas-reveal-effect";
import { cn } from "@/lib/utils";

export const CardSpotlight = ({
  children,
  radius,
  color,
  className,
  variant = "dark",
  ...props
}: {
  radius?: number;
  color?: string;
  variant?: "dark" | "light";
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) => {
  const isLight = variant === "light";
  const resolvedRadius = radius ?? (isLight ? 260 : 350);
  const resolvedColor = color ?? (isLight ? "rgba(16, 185, 129, 0.2)" : "#262626");
  const roundClass = isLight ? "rounded-3xl" : "rounded-md";

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  function handleMouseMove({
    currentTarget,
    clientX,
    clientY,
  }: ReactMouseEvent<HTMLDivElement>) {
    let { left, top } = currentTarget.getBoundingClientRect();

    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  const [isHovering, setIsHovering] = useState(false);
  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);
  return (
    <div
      className={cn(
        "group/spotlight relative overflow-hidden border",
        isLight
          ? "rounded-3xl border-gray-200/80 bg-white/95 p-6 shadow-sm backdrop-blur-sm lg:p-8"
          : "rounded-md border-neutral-800 bg-black p-10 dark:border-neutral-800",
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <motion.div
        className={cn(
          "pointer-events-none absolute z-0 -inset-px opacity-0 transition duration-300 group-hover/spotlight:opacity-100",
          roundClass
        )}
        style={{
          backgroundColor: resolvedColor,
          maskImage: useMotionTemplate`
            radial-gradient(
              ${resolvedRadius}px circle at ${mouseX}px ${mouseY}px,
              white,
              transparent 80%
            )
          `,
        }}
      >
        {isHovering && (
          <CanvasRevealEffect
            animationSpeed={isLight ? 4 : 5}
            containerClassName="bg-transparent absolute inset-0 pointer-events-none"
            colors={
              isLight
                ? [
                    [16, 185, 129],
                    [45, 212, 191],
                  ]
                : [
                    [59, 130, 246],
                    [139, 92, 246],
                  ]
            }
            dotSize={3}
            showGradient={!isLight}
          />
        )}
      </motion.div>
      <div className="relative z-10">{children}</div>
    </div>
  );
};
