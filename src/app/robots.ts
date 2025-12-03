import { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.kosuke.ai';

export default function robots(): MetadataRoute.Robots {
  // Set NEXT_PUBLIC_ENABLE_INDEXING=true in production environment only
  const enableIndexing = process.env.NEXT_PUBLIC_ENABLE_INDEXING === 'true';

  if (!enableIndexing) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  // Only allow legal pages to be indexed
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/terms', '/privacy', '/cookies'],
        disallow: '/',
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
