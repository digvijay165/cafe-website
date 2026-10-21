import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';
import { SiteProvider } from './state';
import { installErrorTracking } from './lib/telemetry';
import Layout from './components/Layout';
import { ErrorBoundary } from './components/ui';
import Home from './pages/Home';
import Menu from './pages/Menu';
import Visit from './pages/Visit';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import { Order, Orders } from './pages/Orders';
import { ForgotPassword, Login, ResetPassword, Signup, VerifyEmail, Welcome } from './pages/Auth';
import Account from './pages/Account';
import Staff from './pages/Staff';
import Owner from './pages/Owner';
import { NotFound, Privacy, Terms } from './pages/Legal';

installErrorTracking();

function App() {
  return (
    <BrowserRouter>
      <SiteProvider>
        <ErrorBoundary>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="menu" element={<Menu />} />
              <Route path="visit" element={<Visit />} />
              <Route path="cart" element={<Cart />} />
              <Route path="checkout" element={<Checkout />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:id" element={<Order />} />
              <Route path="login" element={<Login />} />
              <Route path="signup" element={<Signup />} />
              <Route path="forgot-password" element={<ForgotPassword />} />
              <Route path="reset-password" element={<ResetPassword />} />
              <Route path="verify-email" element={<VerifyEmail />} />
              <Route path="welcome" element={<Welcome />} />
              <Route path="account" element={<Account />} />
              <Route path="staff" element={<Staff />} />
              <Route path="owner" element={<Owner />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="terms" element={<Terms />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </SiteProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);

// Installable app with an offline-friendly shell. Only in production builds, so development
// always sees fresh files.
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
