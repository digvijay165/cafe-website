// Money and time formatting, always in the café's currency and time zone.
let cafe = { locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' };
export const setCafe = next => { cafe = next; };

export function money(cents) {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(cafe.locale, {
    style: 'currency', currency: cafe.currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2
  }).format(cents / 100);
}

export function pickupTime(iso) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(cafe.locale, { timeZone: cafe.timeZone, year: 'numeric', month: 'numeric', day: 'numeric' });
  const today = day.format(new Date());
  const tomorrow = day.format(new Date(Date.now() + 86400000));
  const time = new Intl.DateTimeFormat(cafe.locale, { timeZone: cafe.timeZone, hour: 'numeric', minute: '2-digit' }).format(date);
  const label = day.format(date) === today ? 'Today' : day.format(date) === tomorrow ? 'Tomorrow'
    : new Intl.DateTimeFormat(cafe.locale, { timeZone: cafe.timeZone, weekday: 'long', day: 'numeric', month: 'short' }).format(date);
  return `${label}, ${time}`;
}

export function dateTime(iso) {
  return new Intl.DateTimeFormat(cafe.locale, { timeZone: cafe.timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

// "07:30" -> "7:30 am" in the café's locale.
export function clock(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat(cafe.locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}
