import { PaymentTypes, PlanIntervals } from '@/payment/types';
import type { WebsiteConfig } from '@/types';

/**
 * website config, without translations
 *
 */
export const websiteConfig: WebsiteConfig = {
  ui: {
    theme: {
      defaultTheme: 'default',
      enableSwitch: true,
    },
    mode: {
      defaultMode: 'dark',
      enableSwitch: false,
    },
  },
  metadata: {
    images: {
      ogImage: '/og.png',
      logoLight: '/logo.png',
      logoDark: '/logo-dark.png',
    },
    social: {
      github: '',
      twitter: '',
      blueSky: '',
      discord: '',
      mastodon: '',
      linkedin: '',
      youtube: '',
    },
  },
  features: {
    enableUpgradeCard: true,
    enableUpdateAvatar: true,
    enableAffonsoAffiliate: false,
    enablePromotekitAffiliate: false,
    enableDatafastRevenueTrack: false,
    enableCrispChat: process.env.NEXT_PUBLIC_DEMO_WEBSITE === 'true',
    enableTurnstileCaptcha: process.env.NEXT_PUBLIC_DEMO_WEBSITE === 'true',
  },
  routes: {
    defaultLoginRedirect: '/dashboard',
  },
  analytics: {
    enableVercelAnalytics: false,
    enableSpeedInsights: false,
  },
  auth: {
    enableGoogleLogin: true,
    enableGithubLogin: false,
    enableCredentialLogin: false,
  },
  i18n: {
    defaultLocale: 'en',
    locales: {
      en: {
        flag: '🇺🇸',
        name: 'English',
        hreflang: 'en',
      },
      de: {
        flag: '🇩🇪',
        name: 'Deutsch',
        hreflang: 'de',
      },
    },
  },
  blog: {
    enable: false,
    paginationSize: 6,
    relatedPostsSize: 3,
  },
  docs: {
    enable: false,
  },
  mail: {
    provider: 'resend',
    fromEmail: 'UrlToVideo <support@urlto.video>',
    supportEmail:
      'UrlToVideo <support@urlto.video>',
  },
  newsletter: {
    enable: true,
    provider: 'resend',
    autoSubscribeAfterSignUp: true,
  },
  storage: {
    enable: true,
    provider: 's3',
  },
  payment: {
    provider: 'stripe',
  },
  price: {
    plans: {
      free: {
        id: 'free',
        prices: [],
        isFree: true,
        isLifetime: false,
        credits: {
          enable: false,
          amount: 0,
          expireDays: undefined,
        },
      },

      pro_monthly: {
        id: 'pro_monthly',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY!,
            amount: 990,
            currency: 'USD',
            interval: PlanIntervals.MONTH,
          },
        ],
        isFree: false,
        isLifetime: false,
        popular: false,
        credits: {
          enable: true,
          amount: 700,
          expireDays: 30, // 1 month
        },
        capacity: {
          videoSeconds: 420, // 7 videos x 60s
          imageCount: 140,
        },
      },
      pro_yearly: {
        id: 'pro_yearly',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY!,
            amount: 8390,
            currency: 'USD',
            interval: PlanIntervals.YEAR,
          },
        ],
        isFree: false,
        isLifetime: false,
        popular: false,
        credits: {
          enable: true,
          amount: 8400,
          expireDays: 365, // 1 year
        },
        capacity: {
          videoSeconds: 5040, // 84 videos x 60s
          imageCount: 1680,
        },
      },
      premium_monthly: {
        id: 'premium_monthly',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY!,
            amount: 2990,
            currency: 'USD',
            interval: PlanIntervals.MONTH,
          },
        ],
        isFree: false,
        isLifetime: false,
        popular: true,
        credits: {
          enable: true,
          amount: 2400,
          expireDays: 30, // 1 month
        },
        capacity: {
          videoSeconds: 1440, // 24 videos x 60s
          imageCount: 480,
        },
      },
      premium_yearly: {
        id: 'premium_yearly',
        prices: [
          {
            type: PaymentTypes.SUBSCRIPTION,
            priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_YEARLY!,
            amount: 24990,
            currency: 'USD',
            interval: PlanIntervals.YEAR,
          },
        ],
        isFree: false,
        isLifetime: false,
        popular: true,
        credits: {
          enable: true,
          amount: 28800,
          expireDays: 365, // 1 year
        },
        capacity: {
          videoSeconds: 17280, // 288 videos x 60s
          imageCount: 5760,
        },
      },
    },
  },
  credits: {
    enableCredits: true,
    enablePackagesForFreePlan: true,
    registerGiftCredits: {
      enable: false,
      amount: 0,
      expireDays: 30,
    },
    packages: {
      basic: {
        id: 'basic',
        popular: false,
        amount: 600,
        expireDays: 365,
        price: {
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_BASIC!,
          amount: 990,
          currency: 'USD',
          allowPromotionCode: true,
        },
        capacity: {
          videoSeconds: 360, // 6 videos x 60s
          imageCount: 120,
        },
      },
      standard: {
        id: 'standard',
        popular: true,
        amount: 1400,
        expireDays: 365,
        price: {
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_STANDARD!,
          amount: 1990,
          currency: 'USD',
          allowPromotionCode: true,
        },
        capacity: {
          videoSeconds: 840, // 14 videos x 60s
          imageCount: 280,
        },
      },
      premium: {
        id: 'premium',
        popular: false,
        amount: 3200,
        expireDays: 365,
        price: {
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_PREMIUM!,
          amount: 3990,
          currency: 'USD',
          allowPromotionCode: true,
        },
        capacity: {
          videoSeconds: 1920, // 32 videos x 60s
          imageCount: 640,
        },
      },
      enterprise: {
        id: 'enterprise',
        popular: false,
        amount: 9000,
        expireDays: 365,
        price: {
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_ENTERPRISE!,
          amount: 9990,
          currency: 'USD',
          allowPromotionCode: true,
        },
        capacity: {
          videoSeconds: 5400, // 90 videos x 60s
          imageCount: 1800,
        },
      },
    },
  },
};
