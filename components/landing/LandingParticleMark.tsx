'use client';

import { useEffect, useRef } from 'react';

type Point = {
  x: number;
  y: number;
};

type Particle = Point & {
  seed: number;
  size: number;
  vx: number;
  vy: number;
};

const DESKTOP_PARTICLES = 3600;
const MOBILE_PARTICLES = 2400;
const LIGHT_HERO_DESKTOP_PARTICLES = 5400;
const LIGHT_HERO_MOBILE_PARTICLES = 3400;
const LANGUAGE_DESKTOP_PARTICLES = 6800;
const LANGUAGE_MOBILE_PARTICLES = 4400;
const HERO_LOOP_DURATION = 15_800;
const LANGUAGE_SEGMENT_DURATION = 3_900;
const HERO_DESKTOP_CENTER_X = 0.75;
const HERO_MOBILE_CENTER_X = 0.5;
const LANDING_LOGO_SRC = '/logo.png';
const HUMAN_PORTRAIT_SRC = '/particle-human.png';

type ParticleVariant = 'hero' | 'language';
type ShapeName =
  | 'brand-english'
  | 'promise'
  | 'brand-logo'
  | 'human-portrait'
  | 'easy'
  | 'hindi-easy'
  | 'convenient'
  | 'simple';
type TextShapeName = Exclude<ShapeName, 'brand-logo' | 'human-portrait'>;

const shapeLines: Record<TextShapeName, string[]> = {
  'brand-english': ['EASYRAKH'],
  promise: ['MAKE', 'YOUR', 'BUSINESS', 'STRONGER'],
  easy: ['EASY'],
  'hindi-easy': ['आसान'],
  convenient: ['सुविधाजनक'],
  simple: ['सरल'],
};

const heroShapes: ShapeName[] = [
  'brand-english',
  'promise',
  'brand-logo',
];
const languageShapes: ShapeName[] = [
  'easy',
  'hindi-easy',
  'convenient',
  'simple',
  'human-portrait',
];

function createMask(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function sampleMask(
  mask: HTMLCanvasElement,
  step: number,
  alphaThreshold = 70,
) {
  const context = mask.getContext('2d', { willReadFrequently: true });
  if (!context) return [];

  const image = context.getImageData(0, 0, mask.width, mask.height);
  const points: Point[] = [];

  for (let y = 0; y < mask.height; y += step) {
    for (let x = 0; x < mask.width; x += step) {
      if (
        image.data[(y * mask.width + x) * 4 + 3] >
        alphaThreshold
      ) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

function sampleShape({
  fontFamily,
  height,
  humanImage,
  logoImage,
  shape,
  variant,
  width,
}: {
  fontFamily: string;
  height: number;
  humanImage: HTMLImageElement;
  logoImage: HTMLImageElement;
  shape: ShapeName;
  variant: ParticleVariant;
  width: number;
}) {
  const mask = createMask(width, height);
  const context = mask.getContext('2d');
  if (!context) return [];

  const mobile = width < 720;
  const isHero = variant === 'hero';
  const centerX = isHero
    ? width * (mobile ? HERO_MOBILE_CENTER_X : HERO_DESKTOP_CENTER_X)
    : width * 0.5;
  const centerY = isHero ? (mobile ? height * 0.19 : height * 0.48) : height * 0.47;

  if (shape === 'brand-logo') {
    if (!logoImage.complete || !logoImage.naturalWidth) return [];

    const logoAspectRatio =
      logoImage.naturalWidth / logoImage.naturalHeight;
    const maxLogoWidth = width * (mobile ? 0.76 : 0.4);
    const maxLogoHeight = height * (mobile ? 0.3 : 0.52);
    const logoWidth = Math.min(
      maxLogoWidth,
      maxLogoHeight * logoAspectRatio,
    );
    const logoHeight = logoWidth / logoAspectRatio;
    const logoCenterY = height * (mobile ? 0.16 : 0.48);

    context.drawImage(
      logoImage,
      centerX - logoWidth / 2,
      logoCenterY - logoHeight / 2,
      logoWidth,
      logoHeight,
    );

    return sampleMask(mask, mobile ? 2 : 3, 24);
  }

  if (shape === 'human-portrait') {
    if (!humanImage.complete || !humanImage.naturalWidth) return [];

    const portraitAspectRatio =
      humanImage.naturalWidth / humanImage.naturalHeight;
    const maxPortraitWidth = width * (mobile ? 0.74 : 0.58);
    const maxPortraitHeight = height * (mobile ? 0.82 : 0.88);
    const portraitWidth = Math.min(
      maxPortraitWidth,
      maxPortraitHeight * portraitAspectRatio,
    );
    const portraitHeight = portraitWidth / portraitAspectRatio;
    const portraitCenterY = height * (mobile ? 0.54 : 0.52);

    context.drawImage(
      humanImage,
      centerX - portraitWidth / 2,
      portraitCenterY - portraitHeight / 2,
      portraitWidth,
      portraitHeight,
    );

    return sampleMask(mask, mobile ? 2 : 3, 20);
  }

  const lines = shapeLines[shape];
  const availableWidth = isHero
    ? width * (mobile ? 0.78 : 0.38)
    : width * (mobile ? 0.9 : 0.84);
  const availableHeight = isHero
    ? height * (mobile ? 0.34 : 0.58)
    : height * (mobile ? 0.5 : 0.56);
  const lineHeightRatio = lines.length > 1 ? (mobile ? 0.94 : 1.02) : 0.92;
  let fontSize = Math.min(
    availableHeight / (lines.length * lineHeightRatio),
    height * (isHero ? (mobile ? 0.1 : 0.16) : mobile ? 0.27 : 0.31),
  );
  const canvasFont = `850 ${fontSize}px ${fontFamily}, "Noto Sans Devanagari", sans-serif`;

  context.font = canvasFont;
  const measured = Math.max(
    ...lines.map((line) => context.measureText(line).width),
  );
  if (measured > availableWidth) fontSize *= availableWidth / measured;

  context.fillStyle = '#fff';
  context.font = `850 ${fontSize}px ${fontFamily}, "Noto Sans Devanagari", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const lineHeight = fontSize * lineHeightRatio;
  const firstLineY = centerY - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    context.fillText(line, centerX, firstLineY + index * lineHeight);
  });

  return sampleMask(mask, mobile ? 3 : 4);
}

function distribute(points: Point[], count: number, fallback: Point) {
  if (!points.length) {
    return Array.from({ length: count }, () => fallback);
  }

  return Array.from({ length: count }, (_, index) => {
    const pointIndex = Math.floor(
      ((index * 0.618033988749895) % 1) * points.length,
    );
    const point = points[Math.min(pointIndex, points.length - 1)];
    const duplicate = index >= points.length;

    return {
      x: point.x + (duplicate ? ((index * 37) % 5) - 2 : 0),
      y: point.y + (duplicate ? ((index * 53) % 5) - 2 : 0),
    };
  });
}

function ease(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function getMorph(
  elapsed: number,
  reducedMotion: boolean,
  variant: ParticleVariant,
) {
  const firstShape = variant === 'hero' ? heroShapes[0] : languageShapes[0];
  if (reducedMotion) {
    return { from: firstShape, progress: 0, to: firstShape };
  }

  if (variant === 'language') {
    const cycle = elapsed % (LANGUAGE_SEGMENT_DURATION * languageShapes.length);
    const shapeIndex = Math.floor(cycle / LANGUAGE_SEGMENT_DURATION);
    const withinSegment = cycle % LANGUAGE_SEGMENT_DURATION;
    const from = languageShapes[shapeIndex];
    const to = languageShapes[(shapeIndex + 1) % languageShapes.length];

    if (withinSegment < 2_350) {
      return { from, progress: 0, to: from };
    }

    return {
      from,
      progress: ease(
        (withinSegment - 2_350) /
          (LANGUAGE_SEGMENT_DURATION - 2_350),
      ),
      to,
    };
  }

  const cycle = elapsed % HERO_LOOP_DURATION;
  if (cycle < 2_800) {
    return {
      from: heroShapes[0],
      progress: 0,
      to: heroShapes[0],
    };
  }
  if (cycle < 5_000) {
    return {
      from: heroShapes[0],
      progress: ease((cycle - 2_800) / 2_200),
      to: heroShapes[1],
    };
  }
  if (cycle < 8_200) {
    return {
      from: heroShapes[1],
      progress: 0,
      to: heroShapes[1],
    };
  }
  if (cycle < 10_400) {
    return {
      from: heroShapes[1],
      progress: ease((cycle - 8_200) / 2_200),
      to: heroShapes[2],
    };
  }
  if (cycle < 12_800) {
    return {
      from: heroShapes[2],
      progress: 0,
      to: heroShapes[2],
    };
  }
  return {
    from: heroShapes[2],
    progress: ease((cycle - 12_800) / 3_000),
    to: heroShapes[0],
  };
}

export default function LandingParticleMark({
  variant = 'hero',
}: {
  variant?: ParticleVariant;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const humanImage = new Image();
    const logoImage = new Image();
    humanImage.decoding = 'async';
    humanImage.src = HUMAN_PORTRAIT_SRC;
    logoImage.decoding = 'async';
    logoImage.src = LANDING_LOGO_SRC;
    let frame = 0;
    let height = 0;
    let isVisible = true;
    let lastRenderedTime = -Infinity;
    let particles: Particle[] = [];
    let pointerX = -1000;
    let pointerY = -1000;
    let primary = '#21c98b';
    let secondary = '#caff72';
    let startTime = performance.now();
    let targetSets = {} as Record<ShapeName, Point[]>;
    let width = 0;
    let isLightTheme =
      document.documentElement.dataset.theme !== 'dark' &&
      !document.documentElement.classList.contains('dark');

    const readColors = () => {
      const styles = getComputedStyle(canvas);
      primary =
        styles.getPropertyValue('--kinetic-particle-primary').trim() ||
        '#21c98b';
      secondary =
        styles.getPropertyValue('--kinetic-particle-secondary').trim() ||
        '#caff72';
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const styles = getComputedStyle(document.body);
      const fontFamily =
        styles.getPropertyValue('--font-geist-sans').trim() ||
        styles.fontFamily ||
        'system-ui, sans-serif';
      const mobile = width < 720;
      const count =
        variant === 'language'
          ? mobile
            ? LANGUAGE_MOBILE_PARTICLES
            : LANGUAGE_DESKTOP_PARTICLES
          : isLightTheme
            ? mobile
              ? LIGHT_HERO_MOBILE_PARTICLES
              : LIGHT_HERO_DESKTOP_PARTICLES
            : mobile
              ? MOBILE_PARTICLES
              : DESKTOP_PARTICLES;
      const fallback = {
        x:
          variant === 'hero'
            ? width *
              (width < 720
                ? HERO_MOBILE_CENTER_X
                : HERO_DESKTOP_CENTER_X)
            : width * 0.5,
        y: height * (variant === 'hero' && width < 720 ? 0.19 : 0.47),
      };
      const activeShapes = variant === 'hero' ? heroShapes : languageShapes;
      targetSets = Object.fromEntries(
        activeShapes.map((shape) => [
          shape,
          distribute(
            sampleShape({
              fontFamily,
              height,
              humanImage,
              logoImage,
              shape,
              variant,
              width,
            }),
            count,
            fallback,
          ),
        ]),
      ) as Record<ShapeName, Point[]>;

      particles = Array.from({ length: count }, (_, index) => {
        const target = targetSets[activeShapes[0]][index];
        const seed = ((index * 73) % 997) / 997;
        const scatter = width < 720 ? 18 : 42;
        return {
          seed,
          size:
            variant === 'language'
              ? 1.05 + (((index * 29) % 7) / 7) * 1.85
              : (isLightTheme ? 0.9 : 0.8) +
                (((index * 29) % 7) / 7) *
                  (isLightTheme ? 1.65 : 1.5),
          vx: 0,
          vy: 0,
          x: reducedMotion.matches
            ? target.x
            : target.x + Math.cos(seed * Math.PI * 2) * scatter,
          y: reducedMotion.matches
            ? target.y
            : target.y + Math.sin(seed * Math.PI * 2) * scatter,
        };
      });

      canvas.dataset.particleCount = String(count);
      canvas.dataset.particleTheme = isLightTheme ? 'light' : 'dark';
      canvas.dataset.pointerActive = 'false';
      canvas.dataset.particleVariant = variant;
      canvas.dataset.particleTargets = String(activeShapes.length);
      canvas.dataset.logoTargetLoaded = String(
        logoImage.complete && logoImage.naturalWidth > 0,
      );
      canvas.dataset.humanTargetLoaded = String(
        humanImage.complete && humanImage.naturalWidth > 0,
      );
      startTime = performance.now();
    };

    const pointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointerX = event.clientX - bounds.left;
      pointerY = event.clientY - bounds.top;
      canvas.dataset.pointerActive = 'true';
    };

    const pointerLeave = () => {
      pointerX = -1000;
      pointerY = -1000;
      canvas.dataset.pointerActive = 'false';
    };

    const draw = (timestamp: number) => {
      if (!isVisible || (!reducedMotion.matches && timestamp - lastRenderedTime < 30)) {
        frame = window.requestAnimationFrame(draw);
        return;
      }
      lastRenderedTime = timestamp;

      const elapsed = timestamp - startTime;
      const morph = getMorph(elapsed, reducedMotion.matches, variant);
      const fromTargets = targetSets[morph.from];
      const toTargets = targetSets[morph.to];
      const time = timestamp * 0.001;

      if (!fromTargets?.length || !toTargets?.length) {
        frame = window.requestAnimationFrame(draw);
        return;
      }

      canvas.dataset.particleShape =
        morph.progress === 0 ? morph.from : `${morph.from}-to-${morph.to}`;
      canvas.dataset.particleProgress = morph.progress.toFixed(3);
      context.clearRect(0, 0, width, height);

      particles.forEach((particle, index) => {
        const from = fromTargets[index];
        const to = toTargets[index];
        const breatheX =
          Math.sin(time * 1.15 + particle.seed * Math.PI * 8) * 1.4;
        const breatheY =
          Math.cos(time * 0.92 + particle.seed * Math.PI * 7) * 1.4;
        const targetX =
          from.x + (to.x - from.x) * morph.progress + breatheX;
        const targetY =
          from.y + (to.y - from.y) * morph.progress + breatheY;
        const dx = particle.x - pointerX;
        const dy = particle.y - pointerY;
        const distance = Math.hypot(dx, dy);
        const influence = Math.max(0, 1 - distance / 145);

        particle.vx += (targetX - particle.x) * 0.038;
        particle.vy += (targetY - particle.y) * 0.038;
        if (influence > 0 && distance > 0) {
          particle.vx += (dx / distance) * influence * 2.1;
          particle.vy += (dy / distance) * influence * 2.1;
        }
        particle.vx *= 0.82;
        particle.vy *= 0.82;
        particle.x += particle.vx;
        particle.y += particle.vy;

        const lightHero = variant === 'hero' && isLightTheme;
        const shimmer =
          (variant === 'language' ? 0.58 : lightHero ? 0.5 : 0.44) +
          Math.sin(time * 2 + particle.seed * Math.PI * 9) *
            (variant === 'language' ? 0.16 : lightHero ? 0.18 : 0.22);
        const size = particle.size + influence * 1.4;
        context.globalAlpha = Math.max(
          variant === 'language' ? 0.48 : lightHero ? 0.4 : 0.25,
          Math.min(1, shimmer + (lightHero ? 0.38 : 0.34)),
        );
        context.fillStyle = index % 19 === 0 ? secondary : primary;

        if (index % 29 === 0) {
          context.fillRect(
            particle.x - size * 1.6,
            particle.y - size / 2,
            size * 3.2,
            size,
          );
          context.fillRect(
            particle.x - size / 2,
            particle.y - size * 1.6,
            size,
            size * 3.2,
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
      context.globalAlpha = 1;

      if (!reducedMotion.matches) {
        frame = window.requestAnimationFrame(draw);
      }
    };

    const syncTheme = () => {
      const nextIsLightTheme =
        document.documentElement.dataset.theme !== 'dark' &&
        !document.documentElement.classList.contains('dark');
      readColors();
      if (nextIsLightTheme !== isLightTheme) {
        isLightTheme = nextIsLightTheme;
        resize();
      } else if (reducedMotion.matches) {
        draw(performance.now());
      }
    };
    const themeObserver = new MutationObserver(syncTheme);
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0.01 },
    );
    const resizeObserver = new ResizeObserver(resize);

    readColors();
    resize();
    humanImage.addEventListener('load', resize);
    logoImage.addEventListener('load', resize);
    document.fonts.ready.then(resize).catch(() => undefined);
    frame = window.requestAnimationFrame(draw);
    resizeObserver.observe(canvas);
    visibilityObserver.observe(canvas);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ['class', 'data-theme'],
      attributes: true,
    });
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerleave', pointerLeave);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      themeObserver.disconnect();
      humanImage.removeEventListener('load', resize);
      logoImage.removeEventListener('load', resize);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerleave', pointerLeave);
    };
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      className={`kinetic-particle-canvas kinetic-particle-${variant} absolute inset-0 h-full w-full`}
      aria-hidden="true"
    />
  );
}
