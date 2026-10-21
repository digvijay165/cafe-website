import { Link } from 'react-router-dom';
import { useSite } from '../state';
import { useTitle } from '../lib/hooks';
import { clock, money } from '../lib/format';
import { OpenBadge } from '../components/ui';

const FEATURES = [
  ['☕', 'Roasted down the road', 'Our house blend comes from a small roastery in Chikmagalur, roasted every Monday.'],
  ['🥐', 'Baked here every morning', 'Croissants, buns and cakes come out of our oven from 6 am. When they are gone, they are gone.'],
  ['📱', 'Order ahead, skip the queue', 'Choose a pickup time, pay at the counter, and your order is waiting with your name on it.']
];

export default function Home() {
  useTitle('');
  const { info, menu } = useSite();
  const featured = (menu || []).filter(item => ['flat-white', 'masala-chai', 'butter-croissant', 'paneer-sandwich'].includes(item.slug));
  return (
    <>
      <section className="hero">
        <div className="container py-5">
          <div className="row align-items-center g-5">
            <div className="col-lg-7">
              {info && <OpenBadge hours={info.hours} className="mb-3" />}
              <h1 className="display-4 hero-title">Slow coffee, warm bakes and a quiet corner to sit in.</h1>
              <p className="lead my-4">A neighbourhood café on Lavelle Road. Come in and stay a while, or order ahead and pick up on your way.</p>
              <div className="d-flex flex-wrap gap-2">
                <Link to="/menu" className="btn btn-primary btn-lg">Order for pickup</Link>
                <Link to="/visit" className="btn btn-outline-primary btn-lg">Find us</Link>
              </div>
            </div>
            <div className="col-lg-5 d-none d-lg-block">
              <img src="/hero.svg" alt="Illustration of a cup of coffee and a croissant on a café table" className="img-fluid" width="480" height="420" />
            </div>
          </div>
        </div>
      </section>

      <section className="container py-5">
        <div className="row g-4">
          {FEATURES.map(([icon, title, text]) => (
            <div className="col-md-4" key={title}>
              <div className="feature h-100">
                <div className="feature-icon" aria-hidden="true">{icon}</div>
                <h2 className="h5 mt-3">{title}</h2>
                <p className="text-muted mb-0">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="container pb-5">
          <div className="d-flex align-items-end justify-content-between mb-3">
            <h2 className="section-title mb-0">Regulars’ favourites</h2>
            <Link to="/menu">Full menu →</Link>
          </div>
          <div className="row g-3">
            {featured.map(item => (
              <div className="col-6 col-lg-3" key={item.id}>
                <Link to={`/menu#${item.slug}`} className="favourite h-100">
                  <span className="text-muted small">{item.category}</span>
                  <strong className="d-block">{item.name}</strong>
                  <span>{money(item.priceCents)}</span>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="visit-teaser">
        <div className="container py-5">
          <div className="row g-4 align-items-center">
            <div className="col-md-6">
              <h2 className="section-title">Come and visit</h2>
              <address className="lead mb-2">{info?.cafe.address}</address>
              <p className="mb-4">Two minutes’ walk from Cubbon Park. Street parking on Lavelle Road, bike racks by the door.</p>
              <Link to="/visit" className="btn btn-outline-light">Map and directions</Link>
            </div>
            <div className="col-md-6">
              <ul className="list-unstyled hours-mini mb-0">
                {info?.hours.week.map(day => (
                  <li key={day.day} className={day.day === info.hours.todayIndex ? 'today' : ''}>
                    <span>{day.name}</span>
                    <span>{day.opens ? `${clock(day.opens)} – ${clock(day.closes)}` : 'Closed'}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
