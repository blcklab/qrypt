/** Pure payload builders. No QR rendering, framework, browser, or Node dependencies. */
export { wifi, vcard, email, sms, telephone, geo, calendarEvent } from './payloads/index.js'
export type {
  WifiPayload, VCardPayload, EmailPayload, SMSPayload, GeoPayload, CalendarEventPayload,
} from './payloads/index.js'
