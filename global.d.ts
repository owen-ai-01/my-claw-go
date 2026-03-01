import type { routing } from '@/i18n/routing';
import type messages from './messages/de.json';

/**
 * next-intl 4.0.0
 *
 * https://github.com/amannn/next-intl/blob/main/examples/example-app-router/global.d.ts
 * Types are inferred from messages/de.json
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
