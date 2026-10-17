# Common QR payloads

A QR code stores text or bytes. To make it useful for Wi-Fi, contacts, messaging and calendars, the *text format* matters. Qrypt provides helper functions for common formats.

```ts
import { qrypt } from '@blcklab/qrypt'
import { wifi, vcard, email, sms, telephone, geo, calendarEvent } from '@blcklab/qrypt/payloads'
```

## Wi-Fi access

```ts
const content = wifi({ ssid: 'Guest Network', security: 'WPA2', password: 'example-password' })
const qr = qrypt(content)
```

For an open network use `security: 'nopass'` and omit `password`. This puts the network credentials **in the QR code**; anyone who scans it can read them.

## Contact card (vCard 4.0)

```ts
const content = vcard({
  fullName: 'Alex Rivera',
  organization: 'Example Studio',
  email: 'alex@example.com',
  phone: '+15551234567',
  url: 'https://example.com',
})
const qr = qrypt(content)
```

Contact-app compatibility varies, especially for larger cards. Use a short URL pointing to a profile if the vCard exceeds your capacity budget.

## Email, SMS and telephone

```ts
const mail = email({ to: 'help@example.com', subject: 'Hello', body: 'I have a question.' })
const message = sms({ to: '+15551234567', body: 'Hi!' })
const call = telephone('+15551234567')
```

## Maps and locations

```ts
const location = geo({ latitude: 14.679, longitude: 120.542 })
```

## Calendar event

```ts
const appointment = calendarEvent({
  uid: 'example-event@example.com',
  createdAt: new Date('2026-10-18T00:00:00Z'),
  startsAt: new Date('2026-10-19T10:00:00Z'),
  endsAt: new Date('2026-10-19T11:00:00Z'),
  summary: 'Product demo',
  location: 'Online',
})
const qr = qrypt(appointment)
```

Calendar timestamps are UTC and must be precise to whole seconds. Consumers are responsible for choosing the intended timezone when creating Date values.

## Remember

The helpers return **strings**, not QR images; pass their output to `qrypt()`. QR reader apps vary in how they handle vCard 4.0, Wi-Fi configurations, geographic URIs, and calendar invitations. Test the apps your users actually use.

See [generating QR codes](GENERATING.md) and [troubleshooting](TROUBLESHOOTING.md).
