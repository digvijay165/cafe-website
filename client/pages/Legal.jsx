import { Link } from 'react-router-dom';
import { useTitle } from '../lib/hooks';
import { useSite } from '../state';
import { EmptyState } from '../components/ui';

const UPDATED = '22 October 2026';

export function Privacy() {
  useTitle('Privacy policy');
  const { info } = useSite();
  const email = info?.cafe.email || 'hello@littlelantern.cafe';
  return (
    <article className="container py-5 narrow legal">
      <h1 className="page-title">Privacy policy</h1>
      <p className="text-muted">Last updated {UPDATED}</p>
      <p>This policy explains what Little Lantern Café collects when you use this website, why, and what you can do about it. The short version: we collect what we need to make your order and nothing more, we do not sell it, and we do not use advertising trackers.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address, an optional phone number and a securely hashed password (we never see the password itself).</li>
        <li><strong>Orders:</strong> what you ordered, your pickup time and any note you add.</li>
        <li><strong>Visit statistics:</strong> which pages are viewed and which website sent you here. These are not linked to you, your account or your IP address, and we skip them if your browser sends “Do Not Track”.</li>
        <li><strong>Error reports:</strong> if a page breaks, the technical error message and the page address, so we can fix it.</li>
      </ul>
      <h2>Cookies</h2>
      <p>We set one cookie, only when you log in, to keep you signed in. It is strictly necessary, so there is no cookie banner. Your basket is saved in your own browser’s storage and never leaves your device until you order.</p>
      <h2>How we use it</h2>
      <p>To prepare your order, email you about your account and orders (confirmations, password resets), contact you if there is a problem with an order, and improve the website. We do not send marketing emails.</p>
      <h2>Who we share it with</h2>
      <p>Only the services that run the website for us: our hosting and database provider, and our email delivery provider. They process data on our behalf and may not use it for anything else.</p>
      <h2>How long we keep it</h2>
      <p>Account and order details are kept until you delete your account. Visit statistics and error reports are kept for up to 12 months.</p>
      <h2>Your choices</h2>
      <p>You can update your details or delete your account at any time from <Link to="/account">your account page</Link>. Deleting it immediately removes your account and order history. For anything else, including a copy of your data, email <a href={`mailto:${email}`}>{email}</a>.</p>
    </article>
  );
}

export function Terms() {
  useTitle('Terms');
  const { info } = useSite();
  const phone = info?.cafe.phone || '+91 80 4000 1234';
  return (
    <article className="container py-5 narrow legal">
      <h1 className="page-title">Terms of use</h1>
      <p className="text-muted">Last updated {UPDATED}</p>
      <p>By creating an account or placing an order on this website you agree to these terms. They are written to be read, so please do.</p>
      <h2>Ordering</h2>
      <ul>
        <li>Online orders are for pickup at the café only. We do not deliver.</li>
        <li>Your order is confirmed when you see its order number. Prices shown are in Indian rupees and include GST.</li>
        <li>You pay at the counter when you collect, by cash, card or UPI.</li>
        <li>We hold orders for 30 minutes after the pickup time. After that, freshly made items may be discarded.</li>
        <li>If something sells out after you order, we will call or email you to offer a swap or remove it from your bill.</li>
      </ul>
      <h2>Cancelling</h2>
      <p>You can cancel online until we start making your order. After that, please call us on {phone}. As you pay on collection, there is nothing to refund.</p>
      <h2>Allergens</h2>
      <p>Our kitchen handles nuts, gluten, dairy, eggs, soy and sesame. “Vegan” and “gluten free” labels describe the ingredients, but we cannot rule out traces. Please tell us about allergies in your order note and ask at the counter.</p>
      <h2>Your account</h2>
      <p>Keep your password to yourself; you are responsible for orders placed from your account. We may suspend accounts that repeatedly do not collect orders or misuse the site. You can delete your account at any time.</p>
      <h2>Liability</h2>
      <p>We work hard to keep the menu, prices and opening hours accurate, but mistakes happen. If there is an error, we will tell you before you pay. Nothing in these terms limits your rights under Indian consumer protection law.</p>
      <p>Questions? See our <Link to="/privacy">privacy policy</Link> or call {phone}.</p>
    </article>
  );
}

export function NotFound() {
  useTitle('Page not found');
  return (
    <div className="container py-5">
      <EmptyState icon="🥐" title="We could not find that page." action={<div className="d-flex gap-2 justify-content-center flex-wrap"><Link to="/" className="btn btn-primary">Home</Link><Link to="/menu" className="btn btn-outline-primary">See the menu</Link></div>}>
        The link may be old, or the page has moved. Everything on our menu is still where it should be.
      </EmptyState>
    </div>
  );
}
