'use client';

import { useEffect, useRef } from 'react';
import {
  getParticleMorphState,
  type ParticleShape,
} from '@/components/auth/particleMorph';

type Point = {
  x: number;
  y: number;
};

type Particle = Point & {
  seed: number;
  size: number;
  velocityX: number;
  velocityY: number;
};

const desktopParticleCount = 3200;
const mobileParticleCount = 1800;

function createMask(width: number, height: number) {
  const mask = document.createElement('canvas');
  mask.width = Math.max(1, Math.round(width));
  mask.height = Math.max(1, Math.round(height));
  return mask;
}

function sampleMask(mask: HTMLCanvasElement, step: number) {
  const maskContext = mask.getContext('2d', { willReadFrequently: true });
  if (!maskContext) return [];

  const image = maskContext.getImageData(0, 0, mask.width, mask.height);
  const points: Point[] = [];

  for (let y = 0; y < mask.height; y += step) {
    for (let x = 0; x < mask.width; x += step) {
      if (image.data[(y * mask.width + x) * 4 + 3] > 80) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

function sampleTextShape({
  canvasHeight,
  fontFamily,
  shape,
  usableWidth,
}: {
  canvasHeight: number;
  fontFamily: string;
  shape: ParticleShape;
  usableWidth: number;
}) {
  const mask = createMask(usableWidth, canvasHeight);
  const maskContext = mask.getContext('2d');
  if (!maskContext) return [];

  const isWord = shape === 'easyrakh';
  const text = isWord ? 'EASYRAKH' : '₹';
  const isMobile = usableWidth < 640;
  const maxTextWidth = usableWidth * 0.86;
  let fontSize = isWord
    ? Math.min(canvasHeight * 0.24, usableWidth * 0.17)
    : Math.min(canvasHeight * 0.8, usableWidth * 0.8);

  maskContext.font = `${isWord ? 800 : 900} ${fontSize}px ${fontFamily}`;
  const measuredWidth = maskContext.measureText(text).width;
  if (isWord && measuredWidth > maxTextWidth) {
    fontSize *= maxTextWidth / measuredWidth;
  }

  maskContext.fillStyle = '#ffffff';
  maskContext.font = `${isWord ? 800 : 900} ${fontSize}px ${fontFamily}`;
  maskContext.textAlign = 'center';
  if (isWord) {
    maskContext.textBaseline = 'middle';
    maskContext.fillText(text, usableWidth / 2, canvasHeight * 0.44);
  } else {
    maskContext.textBaseline = 'alphabetic';
    const metrics = maskContext.measureText(text);
    const glyphHeight =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent ||
      fontSize * 0.72;
    const glyphWidth =
      metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight ||
      metrics.width;
    const targetHeight = canvasHeight * (isMobile ? 0.74 : 0.86);
    const targetWidth = usableWidth * 0.72;
    const horizontalScale = targetWidth / Math.max(glyphWidth, 1);
    const verticalScale = targetHeight / Math.max(glyphHeight, 1);
    const bottomY = canvasHeight * (isMobile ? 0.95 : 0.96);
    const baselineY =
      bottomY - metrics.actualBoundingBoxDescent * verticalScale;

    maskContext.save();
    maskContext.translate(usableWidth / 2, baselineY);
    maskContext.scale(horizontalScale, verticalScale);
    maskContext.fillText(text, 0, 0);
    maskContext.restore();
  }

  return sampleMask(mask, isWord ? (isMobile ? 3 : 4) : (isMobile ? 2 : 3));
}

function distributePoints(points: Point[], count: number, fallback: Point) {
  if (points.length === 0) {
    return Array.from({ length: count }, () => fallback);
  }

  return Array.from({ length: count }, (_, index) => {
    const pointIndex = Math.floor(
      ((index * 0.618033988749895) % 1) * points.length,
    );
    const point = points[Math.min(pointIndex, points.length - 1)];
    const needsJitter = index >= points.length;

    return {
      x: point.x + (needsJitter ? ((index * 37) % 5) - 2 : 0),
      y: point.y + (needsJitter ? ((index * 53) % 5) - 2 : 0),
    };
  });
}

function getPointBounds(points: Point[]) {
  return points.reduce(
    (bounds, point) => ({
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
    }),
    {
      maxX: -Infinity,
      maxY: -Infinity,
      minX: Infinity,
      minY: Infinity,
    },
  );
}

export default function AuthParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animationFrame = 0;
    let animationStartTime: number | null = null;
    let easyrakhTargets: Point[] = [];
    let height = 0;
    let lastDiagnosticTime = -Infinity;
    let lastRenderedTime = -Infinity;
    let particles: Particle[] = [];
    let pointerX = -1000;
    let pointerY = -1000;
    let primaryRgb = '89 222 167';
    let rupeeTargets: Point[] = [];
    let secondaryRgb = '220 255 238';
    let siteFontFamily = 'system-ui, sans-serif';
    let width = 0;

    const readThemeColors = () => {
      const pageStyles = getComputedStyle(
        canvas.closest('.auth-kinetic-page') ?? canvas,
      );
      primaryRgb =
        pageStyles.getPropertyValue('--auth-particle-primary').trim() ||
        '89 222 167';
      secondaryRgb =
        pageStyles.getPropertyValue('--auth-particle-secondary').trim() ||
        '220 255 238';
    };

    const readSiteFont = () => {
      const bodyStyles = getComputedStyle(document.body);
      const geistSans = bodyStyles
        .getPropertyValue('--font-geist-sans')
        .trim();
      siteFontFamily = geistSans
        ? `${geistSans}, system-ui, sans-serif`
        : bodyStyles.fontFamily || 'system-ui, sans-serif';
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const usableWidth =
        width >= 1024 ? width - Math.min(680, width * 0.48) : width;
      const particleCount =
        width < 640 ? mobileParticleCount : desktopParticleCount;
      const fallback = { x: usableWidth / 2, y: height * 0.44 };
      const rupeePoints = sampleTextShape({
        canvasHeight: height,
        fontFamily: siteFontFamily,
        shape: 'rupee',
        usableWidth,
      });
      const easyrakhPoints = sampleTextShape({
        canvasHeight: height,
        fontFamily: siteFontFamily,
        shape: 'easyrakh',
        usableWidth,
      });

      rupeeTargets = distributePoints(rupeePoints, particleCount, fallback);
      easyrakhTargets = distributePoints(
        easyrakhPoints,
        particleCount,
        fallback,
      );

      const entranceScatter =
        width < 640 ? 22 : Math.min(usableWidth * 0.08, 62);
      particles = Array.from({ length: particleCount }, (_, index) => {
        const target = rupeeTargets[index];
        const seed = ((index * 73) % 997) / 997;

        return {
          seed,
          size: 1 + (((index * 29) % 7) / 7) * 1.6,
          velocityX: 0,
          velocityY: 0,
          x: reducedMotion.matches
            ? target.x
            : target.x + Math.cos(seed * Math.PI * 2) * entranceScatter,
          y: reducedMotion.matches
            ? target.y
            : target.y + Math.sin(seed * Math.PI * 2) * entranceScatter,
        };
      });

      const targetsInBounds = [...rupeeTargets, ...easyrakhTargets].every(
        (target) =>
          target.x >= 0 &&
          target.x <= usableWidth &&
          target.y >= 0 &&
          target.y <= height,
      );
      const rupeeBounds = getPointBounds(rupeeTargets);
      canvas.dataset.particleCount = String(particleCount);
      canvas.dataset.particleUsableWidth = String(Math.round(usableWidth));
      canvas.dataset.rupeeTargetCount = String(rupeeTargets.length);
      canvas.dataset.rupeeTargetBottom = String(
        Math.round(rupeeBounds.maxY),
      );
      canvas.dataset.rupeeTargetHeight = String(
        Math.round(rupeeBounds.maxY - rupeeBounds.minY),
      );
      canvas.dataset.rupeeTargetTop = String(Math.round(rupeeBounds.minY));
      canvas.dataset.rupeeTargetWidth = String(
        Math.round(rupeeBounds.maxX - rupeeBounds.minX),
      );
      canvas.dataset.wordTargetCount = String(easyrakhTargets.length);
      canvas.dataset.targetsInBounds = String(targetsInBounds);
      canvas.dataset.pointerActive = 'false';
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointerX = event.clientX - bounds.left;
      pointerY = event.clientY - bounds.top;
      canvas.dataset.pointerActive = 'true';
      canvas.dataset.pointerX = String(Math.round(pointerX));
      canvas.dataset.pointerY = String(Math.round(pointerY));
    };

    const handlePointerLeave = () => {
      pointerX = -1000;
      pointerY = -1000;
      canvas.dataset.pointerActive = 'false';
    };

    const draw = (timestamp = performance.now()) => {
      if (!reducedMotion.matches && timestamp - lastRenderedTime < 30) {
        animationFrame = window.requestAnimationFrame(draw);
        return;
      }
      lastRenderedTime = timestamp;

      if (animationStartTime === null) {
        animationStartTime = timestamp;
      }

      const elapsedMs = Math.max(0, timestamp - animationStartTime);
      const morphState = getParticleMorphState(
        elapsedMs,
        reducedMotion.matches,
      );
      const fromTargets =
        morphState.from === 'rupee' ? rupeeTargets : easyrakhTargets;
      const toTargets =
        morphState.to === 'rupee' ? rupeeTargets : easyrakhTargets;
      const rupeeWeight =
        morphState.phase === 'rupee'
          ? 1
          : morphState.from === 'rupee'
            ? 1 - morphState.progress
            : morphState.to === 'rupee'
              ? morphState.progress
              : 0;
      const time = timestamp * 0.001;

      if (elapsedMs - lastDiagnosticTime >= 250) {
        canvas.dataset.particleShape = morphState.phase;
        canvas.dataset.particleFrom = morphState.from;
        canvas.dataset.particleTo = morphState.to;
        canvas.dataset.particleProgress = morphState.progress.toFixed(3);
        canvas.dataset.particleElapsed = String(Math.round(elapsedMs));
        canvas.dataset.rupeeVisualWeight = rupeeWeight.toFixed(3);
        lastDiagnosticTime = elapsedMs;
      }

      context.clearRect(0, 0, width, height);

      particles.forEach((particle, index) => {
        const fromTarget = fromTargets[index];
        const toTarget = toTargets[index];
        const breathingX =
          Math.sin(time * 1.35 + particle.seed * Math.PI * 8) * 1.7;
        const breathingY =
          Math.cos(time * 1.1 + particle.seed * Math.PI * 6) * 1.7;
        const targetX =
          fromTarget.x +
          (toTarget.x - fromTarget.x) * morphState.progress +
          breathingX;
        const targetY =
          fromTarget.y +
          (toTarget.y - fromTarget.y) * morphState.progress +
          breathingY;

        const distanceX = particle.x - pointerX;
        const distanceY = particle.y - pointerY;
        const pointerDistance = Math.hypot(distanceX, distanceY);
        const pointerInfluence = Math.max(0, 1 - pointerDistance / 175);

        particle.velocityX += (targetX - particle.x) * 0.036;
        particle.velocityY += (targetY - particle.y) * 0.036;

        if (pointerInfluence > 0 && pointerDistance > 0) {
          particle.velocityX +=
            (distanceX / pointerDistance) * pointerInfluence * 2.2;
          particle.velocityY +=
            (distanceY / pointerDistance) * pointerInfluence * 2.2;
        }

        particle.velocityX *= 0.82;
        particle.velocityY *= 0.82;
        particle.x += particle.velocityX;
        particle.y += particle.velocityY;

        const shimmer =
          0.5 + Math.sin(time * 2.2 + particle.seed * Math.PI * 10) * 0.2;
        const size =
          particle.size + pointerInfluence * 1.8 + rupeeWeight * 0.55;
        const particleAlpha = Math.min(
          Math.max(shimmer + rupeeWeight * 0.12, 0.24),
          0.94,
        );
        context.fillStyle =
          index % 17 === 0
            ? `rgb(${secondaryRgb} / ${Math.min(shimmer + 0.28, 0.96)})`
            : `rgb(${primaryRgb} / ${particleAlpha})`;

        if (index % 23 === 0) {
          context.fillRect(
            particle.x - size * 1.8,
            particle.y - size / 2,
            size * 3.6,
            size,
          );
          context.fillRect(
            particle.x - size / 2,
            particle.y - size * 1.8,
            size,
            size * 3.6,
          );
        } else {
          context.fillRect(
            particle.x - size / 2,
            particle.y - size / 2,
            size,
            size,
          );
        }
      });

      if (!reducedMotion.matches) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    const redrawForTheme = () => {
      readThemeColors();
      if (reducedMotion.matches) draw();
    };
    const themeObserver = new MutationObserver(redrawForTheme);
    const resizeObserver = new ResizeObserver(() => {
      resize();
      animationStartTime = null;
      if (reducedMotion.matches) draw();
    });

    readSiteFont();
    resize();
    readThemeColors();
    draw();

    themeObserver.observe(document.documentElement, {
      attributeFilter: ['class', 'data-theme'],
      attributes: true,
    });
    resizeObserver.observe(canvas);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-auto absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
