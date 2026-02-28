import * as Sentry from '@sentry/sveltekit'
import { handleErrorWithSentry } from '@sentry/sveltekit'
import { env } from '$env/dynamic/public'

if (env.PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: env.PUBLIC_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  })
}

export const handleError = env.PUBLIC_SENTRY_DSN
  ? handleErrorWithSentry()
  : ({ error, message }) => {
      console.error(error)
      return { message }
    }
