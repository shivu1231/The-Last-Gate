import type { Ref } from 'react';
import { CABLE_PATH } from './bayScene';
import './bay-panels.css';

/**
 * Two website-style panels for Bay 6: a floor plan with Hiro's live position (the World writes
 * his marker's transform every frame), and an annotated drawing of the power regulator.
 */

/** Hall plan coordinates: x −11…11 and z 0 (door) … −34 (back wall), 6 units per metre. */
export const PLAN_SCALE = 6;
export const plan = (x: number, z: number): [number, number] => [(x + 11) * PLAN_SCALE, (z + 34) * PLAN_SCALE];
const box = (x0: number, z0: number, x1: number, z1: number) => {
  const [a, b] = plan(Math.min(x0, x1), Math.min(z0, z1)), [c, d] = plan(Math.max(x0, x1), Math.max(z0, z1));
  return { x: a, y: b, width: c - a, height: d - b };
};

export type PlanMark = { id: string; x: number; z: number; state: 'todo' | 'seen' | 'target' };

export function BayPlan({ marks, cableLive, hiroRef, where }: { marks: PlanMark[]; cableLive: boolean; hiroRef: Ref<SVGGElement>; where: [string, string] }) {
  const cable = CABLE_PATH.filter(([, , z]) => z < 1).map(([x, , z]) => plan(x, z).join(',')).join(' ');
  const [doorL] = plan(-3, 0), [doorR] = plan(3, 0), W = 22 * PLAN_SCALE, H = 34 * PLAN_SCALE;
  return <section className="bay-plan" aria-label="Floor plan of Bay 6">
    <header><p className="bay-kicker">Floor plan · Bay 6</p><span className="bay-plan-scale"><i />10 m</span></header>
    <svg viewBox={`-6 -6 ${W + 12} ${H + 14}`} role="img" aria-label="Bay 6 floor plan with your position">
      <defs>
        <pattern id="bay-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" className="bay-plan-hatch" /></pattern>
      </defs>
      <rect x="0" y="0" width={W} height={H} className="bay-plan-floor" />
      <rect {...box(-11, -34, 11, -30)} fill="url(#bay-hatch)" className="bay-plan-mezz" />
      <path d={`M${doorL},${H} L0,${H} L0,0 L${W},0 L${W},${H} L${doorR},${H}`} className="bay-plan-wall" />
      {/* Cradle bay, benches, tool wall, lockers, racks, stairs, docks. */}
      <rect {...box(-.8, -18.1, 4.8, -11.9)} className="bay-plan-block" rx="1.5" />
      <rect {...box(-1.15, -18.4, 5.15, -11.6)} className="bay-plan-hazard" rx="2" />
      {[-7.9, -12.3, -16.7].map(z => <rect key={z} {...box(-10.55, z - 1.9, -9.55, z + 1.9)} className="bay-plan-block" rx="1" />)}
      <line x1={plan(-10.85, 0)[0]} y1={plan(0, -5.9)[1]} x2={plan(-10.85, 0)[0]} y2={plan(0, -19.9)[1]} className="bay-plan-toolwall" />
      <rect {...box(-11, -23.6, -10.55, -20.5)} className="bay-plan-block" />
      {[0, 1, 2, 3, 4, 5, 6].map(i => <rect key={i} {...box(9.65, -4 - (i + 1) * 2.85, 10.75, -4 - i * 2.85)} className="bay-plan-rack" />)}
      <rect {...box(-9.85, -30, -8.55, -24)} className="bay-plan-stairs" />
      {Array.from({ length: 9 }, (_, i) => <line key={i} x1={plan(-9.85, 0)[0]} x2={plan(-8.55, 0)[0]} y1={plan(0, -24 - i * .67)[1]} y2={plan(0, -24 - i * .67)[1]} className="bay-plan-tread" />)}
      {[0, 1, 2, 3].map(i => <rect key={i} {...box(-5.25 + i * 2.6, -33.95, -3.95 + i * 2.6, -33.15)} className="bay-plan-dock" />)}
      <polyline points={cable} className={`bay-plan-cable ${cableLive ? 'is-live' : ''}`} />
      {marks.map(m => { const [x, y] = plan(m.x, m.z); return <g key={m.id} transform={`translate(${x} ${y})`} className={`bay-plan-mark is-${m.state}`}><circle r="4.2" /><circle r="1.6" className="bay-plan-dot" /></g>; })}
      <g ref={hiroRef} className="bay-plan-hiro" transform={`translate(${plan(0, 5)[0]} ${plan(0, 5)[1]})`}>
        <path d="M0,0 L-11,-24 A26,26 0 0 1 11,-24 Z" className="bay-plan-cone" />
        <circle r="4.6" />
      </g>
      <text x={W / 2} y={H + 7} className="bay-plan-label" textAnchor="middle">ROLLER DOOR</text>
      <text x={W / 2} y={-1.5} className="bay-plan-label" textAnchor="middle" dy="-1">MEZZANINE · DOCKS</text>
    </svg>
    <div className="bay-plan-side">
      <p className="bay-plan-where"><b>{where[0]}</b>{where[1]}</p>
      <ul className="bay-plan-legend"><li><i className="is-you" />You</li><li><i className="is-todo" />To check</li><li><i className="is-seen" />Checked</li><li><i className="is-line" />Hot line</li></ul>
    </div>
  </section>;
}

/** Front elevation of the PR-6, drawn to the model's proportions, with callouts. */
export function RegulatorSheet() {
  const S = 280, X = (x: number) => 190 + x * S, Y = (y: number) => 134 - y * S, F = .016;
  const seg = (x0: number, x1: number, h: number) => ({ x: X(x0), y: Y(F + h), width: (x1 - x0) * S, height: h * S });
  const chev = (cx: number, cy: number) => `${cx - 6},${cy - 7} ${cx + 4},${cy} ${cx - 6},${cy + 7} ${cx - 6},${cy + 3} ${cx - 1},${cy} ${cx - 6},${cy - 3}`;
  return <figure className="bay-schem" aria-label="Annotated drawing of the power regulator">
    <svg viewBox="0 0 380 186">
      {/* Cables first, behind the body. */}
      <path d={`M${X(-.57)},${Y(F + .13)} C${X(-.68)},${Y(.12)} ${X(-.74)},${Y(.02)} ${X(-.62)},${Y(.005)}`} className="s-cable-y" />
      <path d={`M${X(.56)},${Y(F + .13)} C${X(.63)},${Y(.12)} ${X(.64)},${Y(.03)} ${X(.665)},${Y(.005)}`} className="s-cable-k" />
      <path d={`M${X(.51)},${Y(F + .05)} C${X(.56)},${Y(.05)} ${X(.58)},${Y(.005)} ${X(.63)},${Y(.003)}`} className="s-cable-y" />
      <rect {...seg(-.40, -.185, .215)} className="s-dark" />
      <rect {...seg(-.18, .205, .255)} className="s-body" />
      <rect {...seg(.21, .40, .228)} className="s-body" />
      <rect x={X(-.12)} y={Y(F + .315) - 3} width={.26 * S} height="5" rx="2.5" className="s-steel" />
      <rect x={X(-.36)} y={Y(F + .279)} width={.72 * S} height={.024 * S} className="s-dark" />
      {/* End caps, connectors, glands. */}
      <rect {...seg(-.46, -.40, .19)} y={Y(F + .205)} className="s-cap" />
      <rect {...seg(.40, .46, .19)} y={Y(F + .205)} className="s-cap" />
      <rect x={X(-.575)} y={Y(F + .13) - 13} width={.115 * S} height="26" rx="4" className="s-steel" />
      <rect x={X(.46)} y={Y(F + .13) - 14} width={.1 * S} height="28" rx="4" className="s-steel" />
      {/* Face plate, gauge and needle, chevron panel. */}
      <rect x={X(-.153)} y={Y(F + .228)} width={.33 * S} height={.2 * S} rx="3" className="s-plate" />
      <circle cx={X(-.06)} cy={Y(F + .13)} r={.079 * S} className="s-bezel" />
      <circle cx={X(-.06)} cy={Y(F + .13)} r={.068 * S} className="s-face" />
      <line x1={X(-.06)} y1={Y(F + .13)} x2={X(-.06) + 12} y2={Y(F + .13) - 13} className="s-needle" />
      <rect x={X(.051)} y={Y(F + .205)} width={.088 * S} height={.15 * S} className="s-plate" />
      {[-14, 0, 14].map(d => <polygon key={d} points={chev(X(.095), Y(F + .13) + d)} className="s-chev" />)}
      {/* Spec plate and lamp. */}
      <rect x={X(.23)} y={Y(F + .147)} width={.15 * S} height={.094 * S} className="s-spec" />
      {[0, 1, 2, 3].map(i => <line key={i} x1={X(.24)} x2={X(.36) - i * 6} y1={Y(F + .125) + i * 5.5} y2={Y(F + .125) + i * 5.5} className="s-text" />)}
      <circle cx={X(.367)} cy={Y(F + .19)} r="3" className="s-led" />
      <rect {...seg(-.355, -.235, .1)} y={Y(F + .17)} className="s-plate" />
      <rect x={X(-.275)} y={Y(F + .135)} width="11" height="12" className="s-chev" />
      {/* Callouts. */}
      {([
        [X(-.06), Y(F + .21), 92, 14, 'Output gauge', '0–10 ×10 %'],
        [X(.095), Y(F + .205), 196, 14, 'Warning panel', 'Live output'],
        [X(.3), Y(F + .147), 300, 14, 'Spec plate', 'PR-6 · 48 V'],
        [X(-.52), Y(F + .13) + 13, 30, 170, 'Signal plug', 'To the bay'],
        [X(.51), Y(F + .13) + 14, 318, 170, 'Main feed', 'Cable gland'],
      ] as [number, number, number, number, string, string][]).map(([px, py, lx, ly, a, b]) => <g key={a} className="s-call">
        <polyline points={`${px},${py} ${px},${ly < 90 ? ly + 14 : ly - 18} ${lx},${ly < 90 ? ly + 14 : ly - 18}`} />
        <circle cx={px} cy={py} r="2.4" />
        <text x={lx} y={ly} textAnchor="middle"><tspan className="s-call-a">{a}</tspan><tspan x={lx} dy="10" className="s-call-b">{b}</tspan></text>
      </g>)}
    </svg>
  </figure>;
}
