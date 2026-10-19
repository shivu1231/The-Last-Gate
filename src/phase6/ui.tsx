import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import gsap from 'gsap';
import { reducedMotion } from '../config/experience';
import { RINGS, FEED_AT, RETURN_AT, ringLive } from './street';
import { useP6, go } from './store';
import type { PhaseSixAudio } from './audio';

/** A panel that fades and lifts in (GSAP), and again whenever its `id` changes. */
export function Card({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const tween = gsap.fromTo(ref.current, { autoAlpha: 0, y: reducedMotion ? 0 : 14 }, { autoAlpha: 1, y: 0, duration: reducedMotion ? .01 : .45, ease: 'power2.out' });
    return () => { tween.kill(); };
  }, [id]);
  return <div ref={ref} className={`p6-card ${className}`}>{children}</div>;
}

/** Fades a block in on mount (notes, the subtitle line). */
export function FadeIn({ children, className, delay = 0, as: Tag = 'div' }: { children: ReactNode; className: string; delay?: number; as?: 'div' | 'p' }) {
  const ref = useRef<HTMLDivElement & HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const tween = gsap.fromTo(ref.current, { autoAlpha: 0, y: reducedMotion ? 0 : 8 }, { autoAlpha: 1, y: 0, duration: reducedMotion ? .01 : .4, delay: reducedMotion ? 0 : delay, ease: 'power2.out' });
    return () => { tween.kill(); };
  }, []);
  return <Tag ref={ref} className={className}>{children}</Tag>;
}

/**
 * The regulator switch on Hiro's remote, as the page shows it: a rounded rocker with a lever that
 * throws when the store's regulator state changes (the moment the hand clicks it), not on press.
 */
export function RegulatorToggle({ action, busy, onPress, disabled = false, note }: { action: 'on' | 'off'; busy: boolean; onPress: () => void; disabled?: boolean; note?: string }) {
  const on = useP6(s => s.regulator);
  const label = action === 'on' ? 'Activate' : 'Switch off';
  return <button className={`p6-toggle ${on ? 'is-on' : ''}`} role="switch" aria-checked={on} aria-label={`${label} regulator`} disabled={busy || disabled} onClick={onPress}>
    <span className="p6-toggle-lever" aria-hidden="true"><i /></span>
    <span className="p6-toggle-text">{note ?? (busy ? (on ? 'Active' : 'Off') : label)}</span>
  </button>;
}

/** Output meter: animates from full down to the limit when the regulator goes on. */
export function OutputMeter({ value }: { value: number }) {
  const bar = useRef<HTMLElement>(null), num = useRef<HTMLElement>(null);
  const [shown] = useState({ v: 100 });
  useLayoutEffect(() => {
    const tween = gsap.to(shown, { v: value, duration: reducedMotion ? .01 : 1.3, ease: 'power3.inOut', onUpdate: () => {
      if (bar.current) bar.current.style.width = `${shown.v}%`;
      if (num.current) num.current.textContent = `${Math.round(shown.v)}%`;
    } });
    return () => { tween.kill(); };
  }, [value, shown]);
  return <div className="p6-meter"><span>Output</span><b ref={num}>100%</b><i><em ref={bar} /></i></div>;
}

/** A small hand glyph that mimes the drag: press, carry, let go. */
export function DragHand() {
  return <svg className="p6-draghand" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M19 26V12a3 3 0 0 1 6 0v10m0-2a3 3 0 0 1 6 0v3m0-1a3 3 0 0 1 6 0v8c0 7-4 12-11 12h-2c-5 0-8-3-10-6l-5-8a3 3 0 0 1 5-3l3 4" fill="#d9dfd2" stroke="#101a1d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export type Row = [label: string, value: string, tone?: '' | 'red' | 'cyan' | 'orange' | 'ok' | 'dim'];

/**
 * One small contextual panel: what it's reading (a label), a few short readings, and the one
 * control or action for the moment. No paragraphs; the scene shows the why.
 */
export function Panel({ id, label, tone = '', title, rows = [], action, children }: { id: string; label: string; tone?: '' | 'red' | 'cyan'; title?: string; rows?: Row[]; action?: ReactNode; children?: ReactNode }) {
  return <Card id={id} className={`p6-panel ${tone ? `is-${tone}` : ''}`}>
    <p className="p6-label"><span className="p6-tick" aria-hidden="true" />{label}</p>
    {title && <h1>{title}</h1>}
    {rows.length > 0 && <dl className="p6-rows">{rows.map(([k, v, t]) => <div key={k} className={t ? `is-${t}` : ''}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
    {children}
    {action && <p className="p6-action">{action}</p>}
  </Card>;
}

/** Hiro, out loud. */
export function HiroLine({ text }: { text: string }) {
  return <FadeIn className="p6-say" key={text} as="p"><b aria-hidden="true">H</b><span><small>Hiro</small>{text}</span></FadeIn>;
}

const NAMES = ['OUTER', 'MIDDLE', 'INNER'];
const R = [100, 80, 60];
const polar = (deg: number, r: number) => { const a = (deg - 90) * Math.PI / 180; return [120 + Math.cos(a) * r, 120 + Math.sin(a) * r]; };

/**
 * The power ring: turn each segment until its contacts meet. Current runs from the feed, so a
 * junction only reads once everything upstream of it is live. Drag a ring, or pick one and use
 * the arrows (or the keyboard).
 */
export function RingTask({ audio }: { audio: PhaseSixAudio }) {
  const angles = useP6(s => s.angles);
  const [pick, setPick] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ ring: number; last: number; raw?: number } | null>(null);
  const done = useRef(false);
  const live = ringLive(angles);
  const set = (i: number, a: number) => useP6.setState(s => ({ angles: s.angles.map((x, j) => j === i ? ((a % 360) + 360) % 360 : x) }));
  // How far a segment's in contact is from the contact feeding it (the feed, or the out contact
  // of the segment outside it).
  const offBy = (i: number, a: number[]) => { const at = i === 0 ? FEED_AT : a[i - 1] + RINGS[i - 1].out; return ((a[i] + RINGS[i].in - at) % 360 + 540) % 360 - 180; };
  const made = useRef([false, false, false]);
  // Close counts: within 7° the segment pulls home with a click. Finish when the frame reads live.
  const settle = (i: number) => {
    const d = offBy(i, useP6.getState().angles);
    if (Math.abs(d) < 7 && Math.abs(d) > 0) set(i, useP6.getState().angles[i] - d);
    const after = ringLive(useP6.getState().angles);
    after.slice(0, 3).forEach((x, j) => { if (x >= 1 && !made.current[j]) audio.contact(); made.current[j] = x >= 1; });
    if (after[3] >= 1 && !done.current) { done.current = true; window.setTimeout(() => go('powered'), 700); }
  };
  const angleAt = (e: React.PointerEvent) => { const r = svg.current!.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * 240 - 120, y = (e.clientY - r.top) / r.height * 240 - 120; return { deg: Math.atan2(y, x) * 180 / Math.PI + 90, dist: Math.hypot(x, y) }; };
  const down = (e: React.PointerEvent) => {
    const { deg, dist } = angleAt(e);
    const ring = R.findIndex(r => Math.abs(dist - r) < 10); if (ring < 0) return;
    audio.unlock(); setPick(ring); dragging.current = { ring, last: deg }; (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = dragging.current; if (!d) return;
    const { deg } = angleAt(e); let delta = deg - d.last; if (delta > 180) delta -= 360; if (delta < -180) delta += 360;
    d.last = deg; d.raw = (d.raw ?? useP6.getState().angles[d.ring]) + delta;
    // Drag follows the pointer, but a contact catches once it's close.
    const next = [...useP6.getState().angles]; next[d.ring] = d.raw;
    const off = offBy(d.ring, next);
    set(d.ring, Math.abs(off) < 4 ? d.raw - off : d.raw); settle(d.ring);
  };
  const up = () => { if (dragging.current) { settle(dragging.current.ring); dragging.current = null; } };
  const nudge = (dir: number) => { set(pick, angles[pick] + dir * 5); window.setTimeout(() => settle(pick), 0); };
  const kv = (x: number, upstream: number) => upstream < 1 ? '—' : `${(x * 4.8).toFixed(1)} kV`;
  const rows = [['FEED', NAMES[0]], [NAMES[0], NAMES[1]], [NAMES[1], NAMES[2]], [NAMES[2], 'FRAME']];
  return <div className="p6-ring" onKeyDown={e => { if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); } if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); } }}>
    <svg ref={svg} viewBox="0 0 240 240" className="p6-ring-svg" role="img" aria-label="Power ring segments" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <circle cx="120" cy="120" r="112" className="frame" />
      {RINGS.map((ring, i) => {
        const a = angles[i];
        const [ix, iy] = polar(a + ring.in, R[i]), [ox, oy] = polar(a + ring.out, R[i]);
        const gap = a + ring.out + (360 - ring.out) / 2;
        const [sx, sy] = polar(gap + 10, R[i]), [ex, ey] = polar(gap + 350, R[i]);
        return <g key={i} className={`seg ${pick === i ? 'picked' : ''}`}>
          <path d={`M${sx},${sy} A${R[i]},${R[i]} 0 1 1 ${ex},${ey}`} className="arc" />
          <circle cx={ix} cy={iy} r="6" className={`pad ${live[i] >= 1 ? 'live' : live[i] > 0 ? 'warm' : ''}`} />
          <rect x={ox - 5} y={oy - 5} width="10" height="10" rx="2.5" className={`pad out ${live[i + 1] >= 1 ? 'live' : live[i] >= 1 ? 'waiting' : ''}`} transform={`rotate(${a + ring.out} ${ox} ${oy})`} />
        </g>;
      })}
      {(() => { const [fx, fy] = polar(FEED_AT, 114); const [rx, ry] = polar(RETURN_AT, 44); return <>
        <path d={`M${fx - 7},${fy - 9} L${fx + 7},${fy - 9} L${fx},${fy + 1} Z`} className="feed" />
        <circle cx={rx} cy={ry} r="5" className={`return ${live[3] >= 1 ? 'live' : ''}`} />
      </>; })()}
      {/* Where current crosses between two contacts, a short bridge. */}
      {live.map((x, j) => {
        if (x < 1) return null;
        const deg = j === 0 ? FEED_AT : angles[j - 1] + RINGS[j - 1].out, r0 = j === 0 ? 112 : R[j - 1], r1 = j === 3 ? 44 : R[j];
        const [ax, ay] = polar(deg, r0), [bx, by] = polar(deg, r1);
        return <line key={j} x1={ax} y1={ay} x2={bx} y2={by} className="bridge" />;
      })}
      <circle cx="120" cy="120" r="16" className="socket" />
    </svg>
    <p className="p6-ring-key"><span><i className="k-in" />IN</span><span><i className="k-out" />OUT</span></p>
    <div className="p6-ring-controls">
      <div className="p6-seg-picks" role="radiogroup" aria-label="Segment">{NAMES.map((n, i) => <button key={n} role="radio" aria-checked={pick === i} className={`p6-chip ${pick === i ? 'on' : ''}`} onClick={() => setPick(i)}>{n}</button>)}</div>
      <div className="p6-nudge"><button className="p6-round" aria-label="Turn anticlockwise" onClick={() => nudge(-1)}>↺</button><button className="p6-round" aria-label="Turn clockwise" onClick={() => nudge(1)}>↻</button></div>
    </div>
    <dl className="p6-readings">{rows.map(([a, b], i) => <div key={i} className={live[i] >= 1 ? 'live' : ''}><dt>{a} → {b}</dt><dd>{kv(live[i], i === 0 ? 1 : live[i - 1])}</dd></div>)}</dl>
  </div>;
}
