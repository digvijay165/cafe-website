import { useSite } from '../state';
import { useTitle } from '../lib/hooks';
import { clock } from '../lib/format';
import { ErrorNotice, Loading, OpenBadge } from '../components/ui';

export default function Visit() {
  useTitle('Hours & location');
  const { info, infoError, loadInfo } = useSite();
  if (!info) return <div className="container py-5">{infoError ? <ErrorNotice error={infoError} retry={loadInfo} /> : <Loading label="Loading opening hours" />}</div>;
  const { cafe, hours } = info;
  const d = 0.006;
  const bbox = [cafe.longitude - d, cafe.latitude - d / 2, cafe.longitude + d, cafe.latitude + d / 2].join(',');
  const map = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${cafe.latitude},${cafe.longitude}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${cafe.latitude},${cafe.longitude}`;

  return (
    <div className="container py-5">
      <h1 className="page-title">Hours &amp; location</h1>
      <OpenBadge hours={hours} className="mb-4" />
      <div className="row g-4">
        <div className="col-lg-7">
          <div className="map-frame">
            <iframe title={`Map showing ${cafe.name} at ${cafe.address}`} src={map} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
          </div>
          <p className="small text-muted mt-2">Map data © OpenStreetMap contributors.</p>
        </div>
        <div className="col-lg-5">
          <div className="card-soft mb-4">
            <h2 className="h5">Address</h2>
            <address className="mb-3">{cafe.address}</address>
            <div className="d-flex flex-wrap gap-2">
              <a className="btn btn-primary" href={directions} target="_blank" rel="noopener noreferrer">Get directions</a>
              <a className="btn btn-outline-primary" href={`tel:${cafe.phone.replace(/\s/g, '')}`}>Call {cafe.phone}</a>
            </div>
            <p className="small text-muted mt-3 mb-0">Step-free entrance. Street parking on Lavelle Road; the nearest metro is Cubbon Park (8 min walk).</p>
          </div>
          <div className="card-soft">
            <h2 className="h5">Opening hours</h2>
            <table className="table hours-table mb-0">
              <caption className="visually-hidden">Opening hours for each day of the week</caption>
              <tbody>
                {hours.week.map(day => (
                  <tr key={day.day} className={day.day === hours.todayIndex ? 'today' : ''} aria-current={day.day === hours.todayIndex ? 'date' : undefined}>
                    <th scope="row">{day.name}{day.day === hours.todayIndex && <span className="visually-hidden"> (today)</span>}</th>
                    <td className="text-end">{day.opens ? `${clock(day.opens)} – ${clock(day.closes)}` : 'Closed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small text-muted mt-3 mb-0">The last pickup slot is 15 minutes before closing. Hours may change on public holidays.</p>
          </div>
        </div>
      </div>
      <p className="mt-4">Questions, large orders or event bookings: <a href={`mailto:${cafe.email}`}>{cafe.email}</a></p>
    </div>
  );
}
