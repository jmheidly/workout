import * as Sentry from '@sentry/sveltekit'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.request?.url?.includes('/health')) return null
      return event
    },
  })
}
