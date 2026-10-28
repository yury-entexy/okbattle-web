'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Building blocks of the mobile app's screens (lib/presentation/utils/widgets), sized for its
// 390 × 844 design frame.

type Deco = 'leftTop' | 'centerTop' | 'rightSide' | 'leftSide' | 'bottomLeft' | 'bottomRight';
const DECO_IMAGES: Record<Deco, string> = {
  leftTop: 'ui/leftCornerEllipse.png',
  centerTop: 'ui/highCenterEllipse.png',
  rightSide: 'ui/rightEllipse.png',
  leftSide: 'ui/defaultEllipse.png',
  bottomLeft: 'ui/bottom_left_ellipse.png',
  bottomRight: 'ui/bottom_right_ellipse.png',
};

function Decorations({ items }: { items: Deco[] }) {
  return (
    <>
      {items.map((d) => (
        <img key={d} className={`deco deco-${d}`} src={DECO_IMAGES[d]} alt="" aria-hidden />
      ))}
    </>
  );
}

/** The blue header with rounded bottom and the yellow-dot tip (BasicHeader). */
export function Header({ children, deco = ['leftTop', 'centerTop', 'rightSide'], className = '' }: {
  children: ReactNode;
  deco?: Deco[];
  className?: string;
}) {
  return (
    <header className={`bheader ${className}`}>
      <div className="bheader-bg">
        <Decorations items={deco} />
      </div>
      <svg className="bheader-tip" width="92" height="20" viewBox="0 0 92.2227 20" aria-hidden>
        <path d="M64.6485 9.27273C71.2138 2.72727 76.2034 0 92.2227 -0.5L0 -0.5C16.0654 0 22.1054 3.81818 27.3577 9.27273C32.6099 14.7273 39.4378 18 46.0031 18C52.5683 18 58.0832 15.8182 64.6485 9.27273Z" fill="#5E9AD5" />
        <circle cx="46.11" cy="4.97" r="3.97" fill="#FACD62" />
      </svg>
      <div className="bheader-content">{children}</div>
    </header>
  );
}

/** Full-screen blue background with the ellipse decorations (CircleBackground). */
export function BlueScreen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`screen blue ${className}`}>
      <div className="blue-bg" aria-hidden>
        <Decorations items={['leftTop', 'centerTop', 'leftSide', 'rightSide', 'bottomLeft', 'bottomRight']} />
      </div>
      <div className="blue-content">{children}</div>
    </div>
  );
}

export function AppBar({ leading, title, action }: { leading?: ReactNode; title?: ReactNode; action?: ReactNode }) {
  return (
    <div className="appbar">
      <div className="appbar-side">{leading}</div>
      <h1 className="appbar-title">{title ?? 'OK Battle'}</h1>
      <div className="appbar-side end">{action}</div>
    </div>
  );
}

export function RoundButton({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" className="round-btn" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

export const BackIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor" />
  </svg>
);
export const CloseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
  </svg>
);

export function PlayersCounter({ count }: { count: number }) {
  return (
    <span className="pill" aria-label={`Участников: ${count}`}>
      <img src="ui/users_icon.svg" width={16} height={16} alt="" />
      {count}
    </span>
  );
}

export function ScoreCounter({ score }: { score: number }) {
  return (
    <span className="pill score-pill" aria-label={`Очки: ${score}`}>
      <img src="ui/coin.svg" width={19} height={19} alt="" />
      {score}
    </span>
  );
}

export function GameCode({ code }: { code: string }) {
  return <p className="game-code">Код комнаты: {code}</p>;
}

/** The app's pre-round countdown and timer face: three concentric blue circles. */
export function Countdown({ size, children }: { size: number; children: ReactNode }) {
  return (
    <div className="cd" style={{ width: size, height: size }}>
      <div className="cd-2">
        <div className="cd-3" style={{ fontSize: size * 0.36 }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * The music round's player: countdown face, a yellow half-ring filling over the song, and the
 * tonearm (VinylPlayerWidget).
 */
export function Vinyl({ size, secondsLeft, progress }: { size: number; secondsLeft: number; progress: number }) {
  const r = 0.95 * size * 0.5 - 0.028 * size;
  const len = Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  const angle = Math.PI * (1 - p);
  const c = 0.95 * size * 0.5;
  return (
    <div className="vinyl" style={{ width: 1.06 * size, height: 1.05 * size }}>
      <Countdown size={size}>{secondsLeft}</Countdown>
      <svg className="vinyl-ring" width={0.95 * size} height={0.95 * size} viewBox={`0 0 ${2 * c} ${2 * c}`} aria-hidden>
        <path d={`M ${c - r} ${c} A ${r} ${r} 0 0 1 ${c + r} ${c}`} fill="none" stroke="#86B3E2" strokeWidth={0.028 * size} />
        <path
          d={`M ${c - r} ${c} A ${r} ${r} 0 0 1 ${c + r} ${c}`}
          fill="none" stroke="#FACD62" strokeWidth={0.028 * size}
          strokeDasharray={len} strokeDashoffset={len * (1 - p)}
        />
        <circle cx={c + r * Math.cos(angle)} cy={c - r * Math.sin(angle)} r={0.0275 * size} fill="#FACD62" />
      </svg>
      <img className="vinyl-stick" src="ui/music_stick.png" alt="" style={{ height: 0.85 * size, width: 0.3 * size }} />
    </div>
  );
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Quiz rounds: clock and a yellow track (LinearTimeLeftWidget). */
export function TimeBar({ secondsLeft, progress }: { secondsLeft: number; progress: number }) {
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className="timebar" role="timer" aria-label={`Осталось ${secondsLeft} секунд`}>
      <span className="clock">
        <img src="ui/watch.svg" width={19} height={19} alt="" />
        {clock(secondsLeft)}
      </span>
      <span className="timebar-track">
        <span className="timebar-fill" style={{ width: `${p * 100}%` }} />
        <span className="timebar-thumb" style={{ left: `${p * 100}%` }} />
      </span>
    </div>
  );
}

/** White button with a blue outline, or the blue primary one (ActionButton). */
export function ActionButton({ primary, children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button type="button" className={`abtn ${primary ? 'primary' : ''} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** The host's buttons over a white fade at the bottom of the screen (TranslucentControlBlock). */
export function ControlBlock({ children }: { children: ReactNode }) {
  return <div className="control-block">{children}</div>;
}

type LottieAnim = { destroy(): void };

/** The app's Lottie animations (assets/jsons), rendered with lottie-web. */
export function Lottie({ src, loop = true, className = '' }: { src: string; loop?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let anim: LottieAnim | null = null;
    let dead = false;
    void import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
      if (dead || !ref.current) return;
      anim = lottie.loadAnimation({ container: ref.current, renderer: 'svg', loop, autoplay: true, path: src });
    });
    return () => {
      dead = true;
      anim?.destroy();
    };
  }, [src, loop]);
  return <div ref={ref} className={`lottie ${className}`} aria-hidden />;
}

export function Loader() {
  return (
    <div className="loader" role="status" aria-label="Загрузка">
      <Lottie src="lottie/load_1.json" />
    </div>
  );
}

const CONGRATS: Array<[string, string]> = [
  ['Поздравляем, правильный ответ!', 'emoji_party.svg'],
  ['Отличная работа, правильный ответ!', 'emoji_love.svg'],
  ['Вы знаток, правильный ответ!', 'emoji_smart.svg'],
  ['Круто, правильный ответ!', 'emoji_cool.svg'],
  ['Так держать, правильный ответ!', 'emoji_cowboy.png'],
  ['Супер, правильный ответ!', 'emoji_tongue.svg'],
];
const RELIEF: Array<[string, string]> = [
  ['В этот раз неправильно!', 'emoji_sad.svg'],
  ['Вы ошиблись!', 'emoji_cute.svg'],
  ['К сожалению, ответ неверный!', 'emoji_cry.svg'],
  ['Неправильно!', 'emoji_wink.svg'],
];

/** The floating note after a chosen answer is revealed (CongratsSnackBar), for 4 s. */
export function CongratsSnack({ correct }: { correct: boolean }) {
  const [pick] = useState(() => {
    const list = correct ? CONGRATS : RELIEF;
    return list[Math.floor(Math.random() * list.length)];
  });
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), 4000);
    return () => clearTimeout(t);
  }, []);
  if (!shown) return null;
  return <Snack>{pick[0]} <img src={`ui/emoji/${pick[1]}`} width={24} height={24} alt="" /></Snack>;
}

export function Snack({ children }: { children: ReactNode }) {
  return (
    <div className="snack" role="status">
      <span>{children}</span>
    </div>
  );
}

/** A white dialog over a dim backdrop (InfoDialog). */
export function Dialog({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="dialog-close" aria-label="Закрыть" onClick={onClose}><CloseIcon /></button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** One dot per round: green right, red wrong, outlined not yet played (TrafficLight). */
export function TrafficLight({ stats }: { stats: Array<boolean | null> }) {
  return (
    <div className={`traffic ${stats.length >= 20 ? 'spread' : ''}`} aria-hidden>
      {stats.map((s, i) => <i key={i} className={s === null ? '' : s ? 'ok' : 'bad'} />)}
    </div>
  );
}

/** «1 победа», «2 победы», «5 побед». */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
