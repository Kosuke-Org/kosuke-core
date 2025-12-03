import { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.kosuke.ai';

export default function sitemap(): MetadataRoute.Sitemap {
  // Only legal pages are publicly accessible now
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/privacy`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/terms`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/cookies`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  return staticRoutes;
}
