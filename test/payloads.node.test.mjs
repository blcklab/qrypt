import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wifi, vcard, email, sms, telephone, geo, calendarEvent } from '../.m10-check/payloads.js'
import { qrypt } from '../.m10-check/index.js'

const time = (value) => new Date(value)

test('Wi-Fi escaping, open mode and UTF-8 byte limit', () => {
  assert.equal(wifi({ ssid: 'Guest', security: 'nopass' }), 'WIFI:T:nopass;S:Guest;;')
  assert.equal(wifi({ ssid: 'A;B', password: 'a\\b', security: 'WPA2', hidden: true }), 'WIFI:T:WPA;S:A\\;B;P:a\\\\b;H:true;;')
  assert.throws(() => wifi({ ssid: '💡'.repeat(9), security: 'nopass' }), /32/)
  assert.throws(() => wifi({ ssid: 'Private', security: 'WPA' }), /password/)
  assert.throws(() => wifi({ ssid: 'Guest', security: 'nopass', password: 'leak' }), /password/)
})

test('mail, SMS and telephone are safe deterministic URI payloads', () => {
  assert.equal(email({ to: 'team@example.org', subject: 'Status & notes', body: 'A\nB' }), 'mailto:team@example.org?subject=Status%20%26%20notes&body=A%0D%0AB')
  assert.equal(sms({ to: '+639171234567', body: 'Hello & 👍' }), 'sms:+639171234567?body=Hello%20%26%20%F0%9F%91%8D')
  assert.equal(telephone('+441234567890'), 'tel:+441234567890')
  assert.equal(email({ to: 'team@example.org', body: '' }), 'mailto:team@example.org?body=')
  assert.throws(() => email({ to: 'a@example.org', subject: 'Hi\r\nBcc:hacker' }), /control/)
  assert.throws(() => sms({ to: '09171234567' }), /E.164/)
})

test('geo RFC 5870 coordinates and uncertainty are validated and expanded', () => {
  assert.equal(geo({ latitude: 1e-7, longitude: -0, altitude: 100, uncertainty: 0 }), 'geo:0.0000001,0,100;u=0')
  assert.throws(() => geo({ latitude: 91, longitude: 2 }), /latitude/)
  assert.throws(() => geo({ latitude: 0, longitude: Number.NaN }), /longitude/)
  assert.throws(() => geo({ latitude: 0, longitude: 0, uncertainty: -3 }), /uncertainty/)
})

test('vCard 4.0 escape rules, folding and CRLF are correct', () => {
  const name = '🎵'.repeat(40)
  const card = vcard({ fullName: name, givenName: 'Me', familyName: 'A,B', note: 'one;two\nthree', phone: '+639171234567' })
  assert.match(card, /^BEGIN:VCARD\r\nVERSION:4.0\r\n/u)
  assert.match(card, /N:A\\,B;Me;;;\r\n/u)
  assert.ok(card.includes('NOTE:one\\;two\\nthree\r\n'))
  assert.ok(card.replace(/\r\n /g, '').includes(`FN:${name}\r\n`))
  for (const line of card.split('\r\n').filter(Boolean)) assert.ok(Buffer.byteLength(line, 'utf8') <= 75)
  assert.throws(() => vcard({ fullName: 'A\ud800' }), /surrogate/)
  assert.throws(() => vcard({ fullName: 'Me', url: 'javascript:alert(1)' }), /url/)
})

test('calendar emits explicit UTC timestamps with valid escaped values', () => {
  const event = { uid: 'id@example.org', summary: 'Meeting, 1', createdAt: time('2026-10-15T00:00:00Z'), startsAt: time('2026-10-16T10:00:00Z'), endsAt: time('2026-10-16T11:00:00Z'), description: 'A\nB' }
  const output = calendarEvent(event)
  assert.ok(output.includes('DTSTAMP:20261015T000000Z\r\n'))
  assert.ok(output.includes('SUMMARY:Meeting\\, 1\r\nDESCRIPTION:A\\nB\r\n'))
  assert.equal(output, calendarEvent(event))
  assert.throws(() => calendarEvent({ ...event, endsAt: event.startsAt }), /later/)
  assert.throws(() => calendarEvent({ ...event, createdAt: time('2026-10-15T00:00:00.500Z') }), /whole-second/)
})

test('payloads remain consumable as plain strings by the QR encoder', () => {
  const qr = qrypt(wifi({ ssid: 'Guest', security: 'nopass' }))
  assert.equal(qr.matrix().length, qr.size)
  assert.equal(qr.version >= 1 && qr.version <= 40, true)
})

test('reject prototype manipulation and unknown fields', () => {
  assert.throws(() => wifi(Object.assign(Object.create({ ssid: 'wrong' }), { security: 'nopass' })), /plain object/)
  assert.throws(() => wifi({ ssid: 'Guest', security: 'nopass', other: 1 }), /Unknown/)
})
