import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/about', '/privacy', '/terms'],
      disallow: ['/dashboard', '/login', '/register', '/api/'],
    },
    sitemap: 'https://easyrakh.com/sitemap.xml',
  };
}
