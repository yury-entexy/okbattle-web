'use client';

// Ad analytics: the visitor's UTM tags and click ids, and conversion events sent to the Facebook
// Pixel, Google (GA4 / Ads through gtag) and Yandex.Metrica. Each counter loads only when its id
// is set in the environment, so nothing is sent until the ids are configured.
const FB_PIXEL = process.env.NEXT_PUBLIC_FB_PIXEL_ID;
const GA_ID = process.env.NEXT_PUBLIC_GA4_ID;
const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const YM_ID = process.env.NEXT_PUBLIC_YM_ID;

const TAGS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'yclid', 'play'];

export type Utm = Partial<Record<string, string>>;

/** Conversion events, named the same in every counter. */
export type Goal = 'game_join' | 'game_start' | 'game_finish' | 'sign_up';
// Facebook's standard events where one fits, so ad optimisation can use them.
const FB_EVENTS: Record<Goal, [standard: boolean, name: string]> = {
  game_join: [false, 'GameJoin'],
  game_start: [false, 'GameStart'],
  game_finish: [false, 'GameFinish'],
  sign_up: [true, 'CompleteRegistration'],
};

type Fn = (...args: unknown[]) => void;
type Win = Window & { fbq?: Fn & { queue?: unknown[]; callMethod?: Fn; loaded?: boolean; version?: string; push?: Fn }; _fbq?: unknown; dataLayer?: unknown[]; gtag?: Fn; ym?: Fn & { a?: unknown[]; l?: number } };

function store(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

/** First-touch tags stay for the visitor's lifetime; the latest visit's tags win for this session. */
export function utm(): Utm {
  const first = JSON.parse(store('local')?.getItem('sg.utm') || '{}') as Utm;
  const last = JSON.parse(store('session')?.getItem('sg.utm') || '{}') as Utm;
  return { ...first, ...last };
}

function captureUtm() {
  const params = new URLSearchParams(location.search);
  const found: Utm = {};
  for (const t of TAGS) {
    const v = params.get(t);
    if (v) found[t] = v.slice(0, 200);
  }
  if (!Object.keys(found).length) return;
  if (!store('local')?.getItem('sg.utm')) store('local')?.setItem('sg.utm', JSON.stringify({ ...found, landed: new Date().toISOString() }));
  store('session')?.setItem('sg.utm', JSON.stringify(found));
}

function script(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

let started = false;

/** Once per page: remember the ad tags and load the configured counters. */
export function initAnalytics(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  captureUtm();
  const w = window as Win;

  if (FB_PIXEL) {
    // The Pixel's own loader stub, so calls made before the script arrives are queued.
    const fbq: NonNullable<Win['fbq']> = Object.assign(
      (...args: unknown[]) => (fbq.callMethod ? fbq.callMethod(...args) : fbq.queue!.push(args)),
      { queue: [] as unknown[], loaded: true, version: '2.0' },
    );
    fbq.push = fbq;
    w.fbq = fbq;
    w._fbq = fbq;
    script('https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', FB_PIXEL);
    fbq('track', 'PageView');
  }

  if (GA_ID || ADS_ID) {
    w.dataLayer = w.dataLayer || [];
    // gtag must push the arguments object itself.
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
    w.gtag('js', new Date());
    if (GA_ID) w.gtag('config', GA_ID, { campaign: campaign() });
    if (ADS_ID) w.gtag('config', ADS_ID);
    script(`https://www.googletagmanager.com/gtag/js?id=${GA_ID || ADS_ID}`);
  }

  if (YM_ID) {
    const ym: NonNullable<Win['ym']> = Object.assign((...args: unknown[]) => void (ym.a = ym.a || []).push(args), { l: Date.now() });
    w.ym = ym;
    script('https://mc.yandex.ru/metrika/tag.js');
    ym(Number(YM_ID), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true, params: utm() });
  }
}

function campaign() {
  const u = utm();
  return { source: u.utm_source, medium: u.utm_medium, name: u.utm_campaign, content: u.utm_content, term: u.utm_term };
}

/** A conversion event, with the game and the ad tags attached. */
export function track(goal: Goal, params: Record<string, string | number> = {}): void {
  if (typeof window === 'undefined') return;
  const w = window as Win;
  const u = utm();
  const data = { ...params, ...(u.utm_source ? { utm_source: u.utm_source } : {}), ...(u.utm_campaign ? { utm_campaign: u.utm_campaign } : {}) };
  try {
    const [standard, name] = FB_EVENTS[goal];
    w.fbq?.(standard ? 'track' : 'trackCustom', name, data);
    w.gtag?.('event', goal, data);
    if (YM_ID) w.ym?.(Number(YM_ID), 'reachGoal', goal, data);
  } catch {}
}
