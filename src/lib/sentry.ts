// Sentry crash/error monitoring for the app. Complements the AI-specific
// `ai_events` table (server-side) with catch-all client crash reporting.
//
// The DSN is a PUBLIC client key (send-only), safe to ship in the bundle — see
// docs/sentry.md. We read it from EXPO_PUBLIC_SENTRY_DSN when present (so it can
// be overridden per-env) and fall back to the literal so an OTA/local build that
// forgot to inline the env still reports.
import * as Sentry from '@sentry/react-native';

const DEFAULT_DSN =
  'https://12c185ba8d40fa1825fe2cc119a3c757@o4511552801144832.ingest.de.sentry.io/4511552817594448';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? DEFAULT_DSN;

export function initSentry(): void {
  Sentry.init({
    dsn: DSN,
    // No PII: we never attach the user's raw expense text / email to events —
    // consistent with the server-side `ai_events` privacy stance.
    sendDefaultPii: false,
    // Skip dev: avoid noise + the local LAN Supabase network breadcrumbs.
    enabled: !__DEV__,
    // Light performance tracing for a personal-scale app (free plan friendly).
    tracesSampleRate: 0.2,
  });
}
