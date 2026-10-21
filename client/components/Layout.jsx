import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSite } from '../state';
import { api } from '../lib/api';
import { clock, money } from '../lib/format';
import { OpenBadge } from './ui';
import { trackView } from '../lib/telemetry';

function VerifyBanner({ user }) {
  const [state, setState] = useState('idle');
  if (!user || user.emailVerified) return null;
  const resend = async () => {
    setState('sending');
    try { await api('/auth/resend-verification', { method: 'POST' }); setState('sent'); } catch (error) { setState(error.message); }
  };
  return (
    <div className="verify-banner small py-2">
      <div className="container d-flex flex-wrap gap-2 align-items-center">
        <span className="me-auto">📬 Confirm your email (<strong>{user.email}</strong>) to start ordering ahead.</span>
        {state === 'sent' ? <span>Sent! Check your inbox.</span>
          : <button type="button" className="btn btn-sm btn-link p-0" onClick={resend} disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Resend the link'}</button>}
        {!['idle', 'sending', 'sent'].includes(state) && <span className="text-danger w-100">{state}</span>}
      </div>
    </div>
  );
}

function Navbar() {
  const { user, cart, info } = useSite();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const link = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`;
  return (
    <nav className="navbar navbar-expand-lg site-nav sticky-top" aria-label="Main">
      <div className="container">
        <Link className="navbar-brand brand" to="/">
          <img src="/icon.svg" alt="" width="34" height="34" />
          <span>Little Lantern</span>
        </Link>
        <div className="d-flex align-items-center gap-2 order-lg-last">
          <Link to="/cart" className="btn btn-primary btn-sm cart-button" aria-label={`Basket, ${cart.count} item${cart.count === 1 ? '' : 's'}`}>
            <span aria-hidden="true">🛍</span> <span className="d-none d-sm-inline">Basket</span>
            {cart.count > 0 && <span className="badge text-bg-light ms-1">{cart.count}</span>}
          </Link>
          <button className="navbar-toggler" type="button" aria-controls="main-nav" aria-expanded={open} aria-label="Toggle navigation" onClick={() => setOpen(!open)}>
            <span className="navbar-toggler-icon" />
          </button>
        </div>
        <div className={`collapse navbar-collapse ${open ? 'show' : ''}`} id="main-nav">
          <ul className="navbar-nav me-auto">
            <li className="nav-item"><NavLink className={link} to="/menu">Menu</NavLink></li>
            <li className="nav-item"><NavLink className={link} to="/visit">Hours &amp; location</NavLink></li>
            {user && <li className="nav-item"><NavLink className={link} to="/orders">My orders</NavLink></li>}
            {user?.role === 'staff' && <li className="nav-item"><NavLink className={link} to="/staff">Staff</NavLink></li>}
          </ul>
          <ul className="navbar-nav align-items-lg-center">
            {info && <li className="nav-item d-none d-xl-block me-3"><OpenBadge hours={info.hours} /></li>}
            {user === undefined ? null : user
              ? <li className="nav-item"><NavLink className={link} to="/account">{user.name.split(' ')[0]}’s account</NavLink></li>
              : <>
                  <li className="nav-item"><NavLink className={link} to="/login">Log in</NavLink></li>
                  <li className="nav-item"><NavLink className={link} to="/signup">Sign up</NavLink></li>
                </>}
          </ul>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  const { info } = useSite();
  const cafe = info?.cafe;
  return (
    <footer className="site-footer mt-auto">
      <div className="container py-5">
        <div className="row g-4">
          <div className="col-md-5">
            <p className="brand mb-2"><img src="/icon.svg" alt="" width="28" height="28" /> Little Lantern Café</p>
            <p className="small mb-0">{cafe?.tagline}</p>
          </div>
          <div className="col-6 col-md-4 small">
            <h2 className="footer-heading">Find us</h2>
            <address className="mb-1">{cafe?.address}</address>
            {cafe && <a href={`tel:${cafe.phone.replace(/\s/g, '')}`}>{cafe.phone}</a>}
          </div>
          <div className="col-6 col-md-3 small">
            <h2 className="footer-heading">Today</h2>
            <p className="mb-1">{info ? (info.hours.today ? `${clock(info.hours.today.opens)} – ${clock(info.hours.today.closes)}` : 'Closed today') : '…'}</p>
            <Link to="/visit">All opening hours</Link>
          </div>
        </div>
        <hr />
        <div className="d-flex flex-wrap gap-3 small">
          <span className="me-auto">© {new Date().getFullYear()} Little Lantern Café</span>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
      </div>
    </footer>
  );
}

// A floating "view basket" bar on phones so the basket is always one tap away while browsing.
function MobileCartBar() {
  const { cart } = useSite();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!cart.count || ['/cart', '/checkout'].includes(pathname)) return null;
  return (
    <button type="button" className="mobile-cart-bar d-md-none" onClick={() => navigate('/cart')}>
      <span>{cart.count} item{cart.count === 1 ? '' : 's'}</span>
      <strong>View basket · {money(cart.total)}</strong>
    </button>
  );
}

export default function Layout() {
  const { user } = useSite();
  const { pathname } = useLocation();
  useEffect(() => { trackView(pathname); window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="d-flex flex-column min-vh-100">
      <a href="#main" className="visually-hidden-focusable skip-link">Skip to content</a>
      <Navbar />
      <VerifyBanner user={user} />
      <main id="main" className="flex-grow-1">
        <Outlet />
      </main>
      <Footer />
      <MobileCartBar />
    </div>
  );
}
