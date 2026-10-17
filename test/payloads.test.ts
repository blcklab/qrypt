import { describe, expect, it } from 'vitest'
import { qrypt } from '../src/index.js'
import { wifi, vcard, email, sms, telephone, geo, calendarEvent } from '../src/payloads.js'

const date = (value: string): Date => new Date(value)

describe('optional framework-agnostic payload formatters', () => {
  it('emits scanner-compatible Wi-Fi strings and escapes every delimiter', () => {
    expect(wifi({ ssid: 'BLCKLAB', security: 'WPA2', password: 'secret' })).toBe('WIFI:T:WPA;S:BLCKLAB;P:secret;;')
    expect(wifi({ ssid: 'S;,:\\"', security: 'WPA', password: 'p;,:\\"', hidden: true })).toBe(String.raw`WIFI:T:WPA;S:S\;\,\:\\\";P:p\;\,\:\\\";H:true;;`)
    expect(wifi({ ssid: 'Guest', security: 'nopass' })).toBe('WIFI:T:nopass;S:Guest;;')
  })
  it('validates Wi-Fi secrets, modes, and 32-byte UTF-8 SSIDs', () => {
    expect(() => wifi({ ssid: '🎵'.repeat(9), security: 'nopass' })).toThrow(/32/)
    expect(() => wifi({ ssid: 'X', security: 'WPA' })).toThrow(/password/)
    expect(() => wifi({ ssid: 'X', security: 'nopass', password: 'no' })).toThrow(/password/)
    expect(() => wifi({ ssid: 'X', security: 'nopass', hidden: 'true' as never })).toThrow(/boolean/)
  })
  it('encodes mailto body and query components according to RFC 6068', () => {
    expect(email({ to: 'someone@example.com', subject: 'Hello & world?', body: 'First\n第二' }))
      .toBe('mailto:someone@example.com?subject=Hello%20%26%20world%3F&body=First%0D%0A%E7%AC%AC%E4%BA%8C')
  })
  it('blocks CRLF subject injection and unsupported mailbox forms', () => {
    expect(() => email({ to: 'x@example.com', subject: 'Hi\r\nBCC:bad@example.com' })).toThrow()
    expect(() => email({ to: 'not an address' })).toThrow()
    expect(email({ to: 'x@example.com', subject: '' })).toBe('mailto:x@example.com?subject=')
  })
  it('generates RFC 5724 SMS and E.164 tel URIs', () => {
    expect(sms({ to: '+639171234567', body: 'Hi & 😀' })).toBe('sms:+639171234567?body=Hi%20%26%20%F0%9F%98%80')
    expect(telephone('+639171234567')).toBe('tel:+639171234567')
    expect(() => telephone('09171234567')).toThrow(/E.164/)
    expect(() => sms({ to: '+12?body=evil' })).toThrow()
  })
  it('generates RFC 5870 geo coordinates without scientific notation', () => {
    expect(geo({ latitude: 14.84, longitude: 120.28, altitude: 5, uncertainty: 0 })).toBe('geo:14.84,120.28,5;u=0')
    expect(geo({ latitude: 1e-7, longitude: -0 })).toBe('geo:0.0000001,0')
    expect(() => geo({ latitude: 91, longitude: 0 })).toThrow()
    expect(() => geo({ latitude: 0, longitude: Infinity })).toThrow()
    expect(() => geo({ latitude: 0, longitude: 0, uncertainty: -1 })).toThrow()
  })
  it('creates a vCard 4.0 with accurate text escaping and URIs', () => {
    const card = vcard({ fullName: 'Ada, A.', givenName: 'Ada', familyName: 'Lovelace', phone: '+441234567890', email: 'ada@example.com', note: 'First; second\nThird\\x' })
    expect(card).toContain('BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Ada\\, A.\r\n')
    expect(card).toContain('N:Lovelace;Ada;;;\r\n')
    expect(card).toContain('TEL;VALUE=uri:tel:+441234567890\r\n')
    expect(card).toContain('NOTE:First\\; second\\nThird\\\\x\r\n')
    expect(card).toMatch(/END:VCARD\r\n$/)
  })
  it('folds Unicode content without breaking UTF-8 or exceeding 75 octets', () => {
    const long = '🌍'.repeat(45)
    const card = vcard({ fullName: long })
    const physical = card.split('\r\n').filter(Boolean)
    for (const line of physical) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    const unfolded = card.replace(/\r\n /g, '')
    expect(unfolded).toContain(`FN:${long}\r\n`)
  })
  it('builds deterministic UTC RFC 5545 events with explicit UID/DTSTAMP', () => {
    const options = { uid: 'meeting-1@example.com', createdAt: date('2026-10-15T00:00:00Z'), startsAt: date('2026-10-16T09:00:00Z'), endsAt: date('2026-10-16T10:00:00Z'), summary: 'Hello, World', description: 'Please\njoin' }
    const event = calendarEvent(options)
    expect(event).toContain('DTSTAMP:20261015T000000Z\r\n')
    expect(event).toContain('DTSTART:20261016T090000Z\r\nDTEND:20261016T100000Z\r\n')
    expect(event).toContain('SUMMARY:Hello\\, World\r\nDESCRIPTION:Please\\njoin\r\n')
    expect(event).toBe(calendarEvent(options))
  })
  it('rejects lossy millisecond time and invalid event intervals', () => {
    const opts = { uid: 'x', summary: 'Test', createdAt: date('2026-10-15T00:00:00Z'), startsAt: date('2026-10-16T09:00:00Z'), endsAt: date('2026-10-16T10:00:00Z') }
    expect(() => calendarEvent({ ...opts, createdAt: date('2026-10-15T00:00:00.001Z') })).toThrow(/whole-second/)
    expect(() => calendarEvent({ ...opts, endsAt: opts.startsAt })).toThrow(/later/)
    expect(() => calendarEvent({ ...opts, createdAt: new Date(NaN) })).toThrow()
  })
  it('rejects unknown option fields, prototypes, and malformed UTF-16', () => {
    expect(() => wifi(Object.assign(Object.create({ ssid: 'inherit' }), { security: 'nopass' }))).toThrow(/plain object/)
    expect(() => wifi({ ssid: 'ok', security: 'nopass', extra: true } as never)).toThrow(/Unknown/)
    expect(() => vcard({ fullName: '\ud800' })).toThrow(/surrogate/)
    expect(() => vcard({ fullName: 'ok', url: 'javascript:alert(1)' })).toThrow(/URL/)
  })
  it('connects builders to existing QR encoder without modifying the core API', () => {
    const payload = wifi({ ssid: 'Guest', security: 'nopass' })
    const qr = qrypt(payload)
    expect(qr.matrix()).toHaveLength(qr.size)
  })
})
