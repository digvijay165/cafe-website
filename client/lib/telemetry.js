// First-party, cookie-free analytics and error reporting. Page views send only the path and the
// referring site; errors send the message and stack. Nothing identifies the visitor.
const send = (path, body) => {
  const payload = JSON.stringify(body);
  if (navigator.sendBeacon) navigator.sendBeacon(path, new Blob([payload], { type: 'application/json' }));
  else fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
};

let lastPath = null;
export function trackView(path) {
  if (path === lastPath || navigator.doNotTrack === '1') return;
  send('/api/telemetry/view', { path, referrer: lastPath === null ? document.referrer : '' });
  lastPath = path;
}

let reported = 0;
export function reportError(error, extra = '') {
  if (reported >= 10) return;
  reported += 1;
  send('/api/telemetry/error', {
    message: String(error?.message || error).slice(0, 500),
    detail: `${error?.stack || ''}\n${extra}`.slice(0, 4000),
    path: location.pathname
  });
}

export function installErrorTracking() {
  window.addEventListener('error', event => reportError(event.error || event.message));
  window.addEventListener('unhandledrejection', event => reportError(event.reason));
}
