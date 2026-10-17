import { e164, emailAddress, encodeUriComponent, escapeText, foldedDocument, optionalText, record, text, utf8Length } from './internal.js'

export interface WifiPayload {
  readonly ssid: string
  readonly security: 'WPA' | 'WPA2' | 'WEP' | 'nopass'
  readonly password?: string
  readonly hidden?: boolean
}

/** ZXing Wi-Fi network configuration; WPA2 uses scanner-compatible T:WPA. */
export function wifi(options: WifiPayload): string {
  const v = record(options, ['ssid', 'security', 'password', 'hidden'], 'Wi-Fi payload')
  const ssid = text(v.ssid, 'ssid')
  if (utf8Length(ssid) > 32) throw new RangeError('ssid must fit within 32 UTF-8 bytes.')
  const security = v.security
  if (security !== 'WPA' && security !== 'WPA2' && security !== 'WEP' && security !== 'nopass') {
    throw new RangeError('security must be WPA, WPA2, WEP, or nopass.')
  }
  const password = v.password === undefined ? undefined : text(v.password, 'password')
  if (security === 'nopass' && password !== undefined) throw new TypeError('An open network must not include a password.')
  if (security !== 'nopass' && password === undefined) throw new TypeError('A secured network requires a password.')
  if (v.hidden !== undefined && typeof v.hidden !== 'boolean') throw new TypeError('hidden must be a boolean.')
  const escape = (input: string): string => input.replace(/[\\;,:"]/g, char => `\\${char}`)
  const fields = [`T:${security === 'WPA2' ? 'WPA' : security}`, `S:${escape(ssid)}`]
  if (password !== undefined) fields.push(`P:${escape(password)}`)
  if (v.hidden === true) fields.push('H:true')
  return `WIFI:${fields.join(';')};;`
}

export interface EmailPayload {
  readonly to: string
  readonly subject?: string
  readonly body?: string
}

/** RFC 6068 mailto URI. CRLF in the subject is rejected. */
export function email(options: EmailPayload): string {
  const v = record(options, ['to', 'subject', 'body'], 'email payload')
  const address = emailAddress(v.to)
  const subject = optionalText(v.subject, 'subject')
  const body = optionalText(v.body, 'body', true)
  const fields: string[] = []
  if (subject !== undefined) fields.push(`subject=${encodeUriComponent(subject)}`)
  if (body !== undefined) fields.push(`body=${encodeUriComponent(body.replace(/\r\n?|\n/g, '\r\n'))}`)
  const addressUri = address.split('@').map(encodeUriComponent).join('@')
  return `mailto:${addressUri}${fields.length ? `?${fields.join('&')}` : ''}`
}

export interface SMSPayload {
  readonly to: string
  readonly body?: string
}

/** RFC 5724 SMS URI with an international recipient and optional UTF-8 body. */
export function sms(options: SMSPayload): string {
  const v = record(options, ['to', 'body'], 'SMS payload')
  const recipient = e164(v.to)
  const body = optionalText(v.body, 'body', true)
  return `sms:${recipient}${body === undefined ? '' : `?body=${encodeUriComponent(body)}`}`
}

/** RFC 3966 tel URI, international E.164 subset. */
export function telephone(phone: string): string {
  return `tel:${e164(phone)}`
}

export interface GeoPayload {
  readonly latitude: number
  readonly longitude: number
  readonly altitude?: number
  readonly uncertainty?: number
}

function finite(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be a finite number between ${min} and ${max}.`)
  }
  return Object.is(value, -0) ? 0 : value
}

/** Expand JS exponential notation to a plain decimal geo URI coordinate. */
function decimal(value: number): string {
  const raw = String(value)
  if (!/[eE]/u.test(raw)) return raw
  const [mantissa = '', exponentText = ''] = raw.split(/[eE]/u)
  const negative = mantissa.startsWith('-')
  const unsigned = negative ? mantissa.slice(1) : mantissa
  const [whole = '', fraction = ''] = unsigned.split('.')
  const digits = whole + fraction
  const position = whole.length + Number(exponentText)
  const expanded = position <= 0 ? `0.${'0'.repeat(-position)}${digits}` :
    position >= digits.length ? `${digits}${'0'.repeat(position - digits.length)}` :
    `${digits.slice(0, position)}.${digits.slice(position)}`
  return `${negative ? '-' : ''}${expanded}`
}

/** RFC 5870 WGS-84 geographical location URI. */
export function geo(options: GeoPayload): string {
  const v = record(options, ['latitude', 'longitude', 'altitude', 'uncertainty'], 'geo payload')
  const lat = finite(v.latitude, 'latitude', -90, 90)
  const lon = finite(v.longitude, 'longitude', -180, 180)
  const alt = v.altitude === undefined ? undefined : finite(v.altitude, 'altitude', -Number.MAX_VALUE, Number.MAX_VALUE)
  const unc = v.uncertainty === undefined ? undefined : finite(v.uncertainty, 'uncertainty', 0, Number.MAX_VALUE)
  return `geo:${decimal(lat)},${decimal(lon)}${alt === undefined ? '' : `,${decimal(alt)}`}${unc === undefined ? '' : `;u=${decimal(unc)}`}`
}

export interface VCardPayload {
  readonly fullName: string
  readonly givenName?: string
  readonly familyName?: string
  readonly organization?: string
  readonly title?: string
  readonly email?: string
  readonly phone?: string
  readonly url?: string
  readonly note?: string
}

/** RFC 6350 vCard 4.0 with UTF-8 byte-aware folding. */
export function vcard(options: VCardPayload): string {
  const v = record(options, ['fullName', 'givenName', 'familyName', 'organization', 'title', 'email', 'phone', 'url', 'note'], 'vCard payload')
  const name = text(v.fullName, 'fullName', { multiline: true })
  const given = optionalText(v.givenName, 'givenName', true)
  const family = optionalText(v.familyName, 'familyName', true)
  const org = optionalText(v.organization, 'organization', true)
  const title = optionalText(v.title, 'title', true)
  const note = optionalText(v.note, 'note', true)
  const address = v.email === undefined ? undefined : emailAddress(v.email)
  const phone = v.phone === undefined ? undefined : e164(v.phone)
  const url = optionalText(v.url, 'url')
  if (url !== undefined && !/^https?:\/\/[^/?#@\s]+(?:[/?#][^\s]*)?$/iu.test(url)) {
    throw new RangeError('url must be an absolute http(s) URL without credentials.')
  }
  const lines = ['BEGIN:VCARD', 'VERSION:4.0', `FN:${escapeText(name)}`]
  if (given !== undefined || family !== undefined) lines.push(`N:${escapeText(family ?? '')};${escapeText(given ?? '')};;;`)
  if (org !== undefined) lines.push(`ORG:${escapeText(org)}`)
  if (title !== undefined) lines.push(`TITLE:${escapeText(title)}`)
  if (address !== undefined) lines.push(`EMAIL:${address}`)
  if (phone !== undefined) lines.push(`TEL;VALUE=uri:tel:${phone}`)
  if (url !== undefined) lines.push(`URL:${url}`)
  if (note !== undefined) lines.push(`NOTE:${escapeText(note)}`)
  return foldedDocument([...lines, 'END:VCARD'])
}

export interface CalendarEventPayload {
  readonly uid: string
  readonly createdAt: Date
  readonly startsAt: Date
  readonly endsAt: Date
  readonly summary: string
  readonly description?: string
  readonly location?: string
}

function utcTimestamp(value: unknown, name: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new TypeError(`${name} must be a valid Date.`)
  if (value.getUTCMilliseconds() !== 0) throw new RangeError(`${name} must have whole-second precision.`)
  const iso = value.toISOString()
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/u.test(iso)) {
    throw new RangeError(`${name} must fall within four-digit UTC years.`)
  }
  return iso.replace(/[-:]/g, '').replace('.000Z', 'Z')
}

/** Deterministic RFC 5545 UTC calendar event: caller supplies UID and timestamps. */
export function calendarEvent(options: CalendarEventPayload): string {
  const v = record(options, ['uid', 'createdAt', 'startsAt', 'endsAt', 'summary', 'description', 'location'], 'calendar event')
  const uid = text(v.uid, 'uid')
  const summary = text(v.summary, 'summary', { multiline: true })
  const description = optionalText(v.description, 'description', true)
  const location = optionalText(v.location, 'location', true)
  const stamp = utcTimestamp(v.createdAt, 'createdAt')
  const start = utcTimestamp(v.startsAt, 'startsAt')
  const end = utcTimestamp(v.endsAt, 'endsAt')
  if ((v.endsAt as Date).getTime() <= (v.startsAt as Date).getTime()) throw new RangeError('endsAt must be later than startsAt.')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BLCKLAB//Qrypt//EN',
    'BEGIN:VEVENT', `UID:${escapeText(uid)}`, `DTSTAMP:${stamp}`,
    `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${escapeText(summary)}`,
  ]
  if (description !== undefined) lines.push(`DESCRIPTION:${escapeText(description)}`)
  if (location !== undefined) lines.push(`LOCATION:${escapeText(location)}`)
  return foldedDocument([...lines, 'END:VEVENT', 'END:VCALENDAR'])
}
