import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/**
 * https://nextjs.org/docs/app/api-reference/config/next-config-js
 */
const nextConfig: NextConfig = {
  // Docker standalone output
  ...(process.env.DOCKER_BUILD === 'true' && { output: 'standalone' }),

  /* config options here */
  devIndicators: false,

  // https://nextjs.org/docs/architecture/nextjs-compiler#remove-console
  // Remove all console.* calls in production only
  compiler: {
    // removeConsole: process.env.NODE_ENV === 'production',
  },

  images: {
    // https://vercel.com/docs/image-optimization/managing-image-optimization-costs#minimizing-image-optimization-costs
    // https://nextjs.org/docs/app/api-reference/components/image#unoptimized
    // vercel has limits on image optimization, 1000 images per month
    unoptimized: process.env.DISABLE_IMAGE_OPTIMIZATION === 'true',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'randomuser.me',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'ik.imagekit.io',
      },
      {
        protocol: 'https',
        hostname: 'html.tailus.io',
      },
      {
        protocol: 'https',
        hostname: 'service.firecrawl.dev',
      },
      {
        protocol: 'https',
        hostname: 'files.hintergrundentfernenki.de',
      },
      {
        protocol: 'https',
        hostname: 'files.urlto.video',
      },
      {
        protocol: 'https',
        hostname: 'shotstack-api-v1-output.s3-ap-southeast-2.amazonaws.com',
      },
    ],
  },

  // ✅ CSP headers: dev / prod 区分
  async headers() {
    // if (process.env.NODE_ENV === 'production') {
    //   // 生产环境：严格 CSP
    //   return [
    //     {
    //       source: '/(.*)',
    //       headers: [
    //         {
    //           key: 'Content-Security-Policy',
    //           value: `
    //             default-src 'self';
    //             script-src 'self' https://js.stripe.com;
    //             frame-src 'self' https://checkout.stripe.com;
    //             connect-src 'self' https://api.stripe.com;
    //             img-src 'self' data:;
    //             style-src 'self' 'unsafe-inline';
    //           `.replace(/\s{2,}/g, ' '),
    //         },
    //       ],
    //     },
    //   ];
    // }

    // Extract R2 domain from STORAGE_PUBLIC_URL if available
    const storagePublicUrl = process.env.STORAGE_PUBLIC_URL;
    let r2Domains =
      'https://pub-4da77575d4c84b63a46ce3d4067631a5.r2.dev https://pub-51abea15bea14bc7807f99667c9c798a.r2.dev';

    if (storagePublicUrl) {
      try {
        const url = new URL(storagePublicUrl);
        // If it's an R2 domain, add it to the list
        if (url.hostname.endsWith('.r2.dev')) {
          const r2Domain = `https://${url.hostname}`;
          if (!r2Domains.includes(r2Domain)) {
            r2Domains += ` ${r2Domain}`;
          }
        }
      } catch (error) {
        // Invalid URL, ignore
        console.warn('Invalid STORAGE_PUBLIC_URL:', storagePublicUrl);
      }
    }

    // 开发环境：允许 unsafe-inline / unsafe-eval / blob，支持 Next.js 热刷新和 Stripe
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com https://plausible.io https://challenges.cloudflare.com https://cloud.umami.is blob:;
              frame-src 'self' https://checkout.stripe.com https://challenges.cloudflare.com;
              connect-src 'self' https://api.stripe.com https://www.google-analytics.com https://analytics.google.com https://cloudflareinsights.com https://plausible.io https://cloud.umami.is https://api-gateway.umami.dev ws:;
              img-src 'self' data: ${r2Domains} https://replicate.delivery/ https://storage.googleapis.com https://placehold.co https://files.aiavatar.best https://files.hintergrundentfernenki.de https://files.urlto.video https://www.google-analytics.com https://www.googletagmanager.com https://lh3.googleusercontent.com;
              media-src 'self' https://replicate.delivery/ https://files.urlto.video https://shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com https://shotstack-api-v1-output.s3-ap-southeast-2.amazonaws.com;
              style-src 'self' 'unsafe-inline';
            `.replace(/\s{2,}/g, ' '),
          },
        ],
      },
    ];
  },
};

/**
 * You can specify the path to the request config file or use the default one (@/i18n/request.ts)
 *
 * https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing#next-config
 */
const withNextIntl = createNextIntlPlugin();

/**
 * https://fumadocs.dev/docs/ui/manual-installation
 * https://fumadocs.dev/docs/mdx/plugin
 */
const withMDX = createMDX();

export default withMDX(withNextIntl(nextConfig));
