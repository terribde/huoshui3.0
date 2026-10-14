let started = false;
let browserId: string | null = null;
function visitor() {
  if (browserId) return browserId;
  try { const stored = localStorage.getItem(storageKey); if (stored && uuid.test(stored)) browserId = stored; } catch {}
  if (!browserId) { browserId = randomId(); try { localStorage.setItem(storageKey, browserId); } catch {} }
  return browserId;
}
declare global { interface Window { __swjtuVisitTrackingStarted?: boolean } }
const storageKey = 'swjtu.analytics.visitor.v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One event per visible document load. Internal tabs/modals are not page views. */
export function startVisitTracking() {
  if (started || window.__swjtuVisitTrackingStarted || import.meta.env.VITE_ANALYTICS_ENABLED !== 'true') return;
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return;
  started = true;
  window.__swjtuVisitTrackingStarted = true;
  const record = async () => {
    try {
      const visitorId = visitor();
      // Metrics are best-effort; failure must never interfere with the website.
      await fetch('/api/analytics/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: randomId(), visitorId }), keepalive: true,
        credentials: 'omit', signal: AbortSignal.timeout(5000) });
    } catch { /* Offline, unsupported crypto, or analytics not installed. */ }
  };
  if (document.visibilityState === 'visible') void record();
  else {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      void record();
    };
    document.addEventListener('visibilitychange', onVisible);
  }
}

// getRandomValues also works on the site's plain HTTP IP entry point.
function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
