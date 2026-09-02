import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizePairingCode } from '../src/access/pairing.ts'

test('pairing code entry is normalized for the public activation request', () => {
  assert.equal(normalizePairingCode(' abcd-2e9f '), 'ABCD-2E9F')
  assert.equal(normalizePairingCode('abcd2e9f'), 'ABCD-2E9F')
  assert.equal(normalizePairingCode('abcd-2e9f-more'), 'ABCD-2E9F')
})
