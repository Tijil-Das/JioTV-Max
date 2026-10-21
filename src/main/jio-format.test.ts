import { describe, expect, it } from 'vitest'
import { jioNumberPayload } from './jio-format'

describe('jioNumberPayload', () => {
  it('encodes the +91 country code with the national number', () => {
    expect(Buffer.from(jioNumberPayload('9876543210'), 'base64').toString('utf8')).toBe(
      '+919876543210'
    )
  })
})
