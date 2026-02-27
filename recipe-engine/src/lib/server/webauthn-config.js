import { env } from '$env/dynamic/private'
import { dev } from '$app/environment'

export const rpName = 'Rye Bakehouse'

export const rpID = dev ? 'localhost' : env.WEBAUTHN_RP_ID

export const origin = dev ? 'http://localhost:4000' : env.WEBAUTHN_ORIGIN
