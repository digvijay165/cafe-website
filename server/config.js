// Everything about the café that is not in the database. Override any of it with environment
// variables so the same build can run for a different shop.
const env = process.env;

module.exports = {
  production: env.NODE_ENV === 'production',
  port: Number(env.PORT || 3000),
  // RENDER_EXTERNAL_URL is set automatically on Render.
  publicUrl: (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  staffEmails: (env.STAFF_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean),
  ownerEmails: (env.OWNER_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean),
  cafe: {
    name: env.CAFE_NAME || 'Little Lantern Café',
    tagline: env.CAFE_TAGLINE || 'Slow coffee, warm bakes and a quiet corner to sit in.',
    address: env.CAFE_ADDRESS || '14 Lavelle Road, Ashok Nagar, Bengaluru 560001',
    phone: env.CAFE_PHONE || '+91 80 4000 1234',
    email: env.CAFE_EMAIL || 'hello@littlelantern.cafe',
    timeZone: env.CAFE_TZ || 'Asia/Kolkata',
    currency: env.CAFE_CURRENCY || 'INR',
    locale: env.CAFE_LOCALE || 'en-IN',
    latitude: Number(env.CAFE_LAT || 12.9698),
    longitude: Number(env.CAFE_LON || 77.5986)
  }
};
