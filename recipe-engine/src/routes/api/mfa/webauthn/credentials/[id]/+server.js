import { json } from '@sveltejs/kit'
import {
  getWebAuthnCredential,
  deleteWebAuthnCredential,
  countUserMfaKeys,
  setUserMfaEnabled,
} from '$lib/server/db.js'

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ locals, params }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const credential = getWebAuthnCredential(params.id)
  if (
    !credential ||
    credential.user_id !== locals.user.id ||
    credential.kind !== 'mfa_key'
  ) {
    return json({ error: 'Not found' }, { status: 404 })
  }

  deleteWebAuthnCredential(params.id)

  if (countUserMfaKeys(locals.user.id) === 0) {
    setUserMfaEnabled(locals.user.id, 0)
  }

  return json({ ok: true })
}
