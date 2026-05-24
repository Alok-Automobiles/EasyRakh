export default function sitemap() {
    return [
      {
        url: 'https://easyrakh.com',
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 1,
      },
      {
        url: 'https://easyrakh.com/about',
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.8,
      },
      {
        url: 'https://easyrakh.com/privacy',
        lastModified: new Date(),
        changeFrequency: 'yearly',
        priority: 0.3,
      },
      {
        url: 'https://easyrakh.com/terms',
        lastModified: new Date(),
        changeFrequency: 'yearly',
        priority: 0.3,
      },
    ]
  }