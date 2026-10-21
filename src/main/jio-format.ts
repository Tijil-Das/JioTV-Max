/**
 * JioTV's login APIs take the mobile number as base64 of the full E.164
 * value. JioTV-Go's CLI does `"+91" + mobileNumber`; sending the bare ten
 * digits is rejected with "Please login with a Jio phone number" even when
 * the SIM is a Jio SIM.
 */
export function jioNumberPayload(nationalNumber: string): string {
  return Buffer.from(`+91${nationalNumber}`, 'utf8').toString('base64')
}
