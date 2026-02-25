import { Google } from 'arctic'
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ORIGIN } from '$env/static/private'

const redirectUri = `${ORIGIN}/login/google/callback`

export const google = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri)
