import type { Ref } from 'react';
import { CABLE_PATH } from './bayScene';
import './bay-panels.css';

/**
 * Two website-style panels for Bay 6: a floor plan with Hiro's live position (the World writes
 * his marker's transform every frame), and an annotated drawing of the power regulator.
 */

/** Hall plan coordinates: x −11…11 and z 0 (door) … −34 (back wall), 6 units per metre. */
export const PLAN_SCALE = 6;
export const plan = (
  xPosition: number,
  zPosition: number,
): [number, number] => [
  (xPosition + 11) * PLAN_SCALE,
  (zPosition + 34) * PLAN_SCALE,
];
const box = (x0: number, z0: number, x1: number, z1: number) => {
  const [firstValue, secondValue] = plan(Math.min(x0, x1), Math.min(z0, z1)),
    [componentValue, depth] = plan(Math.max(x0, x1), Math.max(z0, z1));
  return {
    x: firstValue,
    y: secondValue,
    width: componentValue - firstValue,
    height: depth - secondValue,
  };
};

/**
 * Data contract used by Bay 6 and its city approach.
 */
export type PlanMark = {
  id: string;
  x: number;
  z: number;
  state: 'todo' | 'seen' | 'target';
};

/**
 * Render the service-bay plan with its existing equipment markers and location feedback.
 */
export function BayPlan({
  marks,
  cableLive,
  hiroRef,
  where,
}: {
  marks: PlanMark[];
  cableLive: boolean;
  hiroRef: Ref<SVGGElement>;
  where: [string, string];
}) {
  const cable = CABLE_PATH.filter(([, , zPosition]) => zPosition < 1)
    .map(([xPosition, , zPosition]) => plan(xPosition, zPosition).join(','))
    .join(' ');
  const [doorL] = plan(-3, 0),
    [doorR] = plan(3, 0),
    scalarValue = 22 * PLAN_SCALE,
    scalarValue2 = 34 * PLAN_SCALE;
  return (
    <section className="bay-plan" aria-label="Floor plan of Bay 6">
      <header>
        <p className="bay-kicker">Floor plan · Bay 6</p>
        <span className="bay-plan-scale">
          <i />
          10 m
        </span>
      </header>
      <svg
        viewBox={`-6 -6 ${scalarValue + 12} ${scalarValue2 + 14}`}
        role="img"
        aria-label="Bay 6 floor plan with your position"
      >
        <defs>
          <pattern
            id="bay-hatch"
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="4" className="bay-plan-hatch" />
          </pattern>
        </defs>
        <rect
          x="0"
          y="0"
          width={scalarValue}
          height={scalarValue2}
          className="bay-plan-floor"
        />
        <rect
          {...box(-11, -34, 11, -30)}
          fill="url(#bay-hatch)"
          className="bay-plan-mezz"
        />
        <path
          d={`M${doorL},${scalarValue2} L0,${scalarValue2} L0,0 L${scalarValue},0 L${scalarValue},${scalarValue2} L${doorR},${scalarValue2}`}
          className="bay-plan-wall"
        />
        {/* Cradle bay, benches, tool wall, lockers, racks, stairs, docks. */}
        <rect
          {...box(-0.8, -18.1, 4.8, -11.9)}
          className="bay-plan-block"
          rx="1.5"
        />
        <rect
          {...box(-1.15, -18.4, 5.15, -11.6)}
          className="bay-plan-hazard"
          rx="2"
        />
        {[-7.9, -12.3, -16.7].map((zPosition) => (
          <rect
            key={zPosition}
            {...box(-10.55, zPosition - 1.9, -9.55, zPosition + 1.9)}
            className="bay-plan-block"
            rx="1"
          />
        ))}
        <line
          x1={plan(-10.85, 0)[0]}
          y1={plan(0, -5.9)[1]}
          x2={plan(-10.85, 0)[0]}
          y2={plan(0, -19.9)[1]}
          className="bay-plan-toolwall"
        />
        <rect {...box(-11, -23.6, -10.55, -20.5)} className="bay-plan-block" />
        {[0, 1, 2, 3, 4, 5, 6].map((index) => (
          <rect
            key={index}
            {...box(9.65, -4 - (index + 1) * 2.85, 10.75, -4 - index * 2.85)}
            className="bay-plan-rack"
          />
        ))}
        <rect {...box(-9.85, -30, -8.55, -24)} className="bay-plan-stairs" />
        {Array.from({ length: 9 }, (unusedValue, index) => (
          <line
            key={index}
            x1={plan(-9.85, 0)[0]}
            x2={plan(-8.55, 0)[0]}
            y1={plan(0, -24 - index * 0.67)[1]}
            y2={plan(0, -24 - index * 0.67)[1]}
            className="bay-plan-tread"
          />
        ))}
        {[0, 1, 2, 3].map((index) => (
          <rect
            key={index}
            {...box(-5.25 + index * 2.6, -33.95, -3.95 + index * 2.6, -33.15)}
            className="bay-plan-dock"
          />
        ))}
        <polyline
          points={cable}
          className={`bay-plan-cable ${cableLive ? 'is-live' : ''}`}
        />
        {marks.map((mesh) => {
          const [xPosition, yPosition] = plan(mesh.x, mesh.z);
          return (
            <g
              key={mesh.id}
              transform={`translate(${xPosition} ${yPosition})`}
              className={`bay-plan-mark is-${mesh.state}`}
            >
              <circle r="4.2" />
              <circle r="1.6" className="bay-plan-dot" />
            </g>
          );
        })}
        <g
          ref={hiroRef}
          className="bay-plan-hiro"
          transform={`translate(${plan(0, 5)[0]} ${plan(0, 5)[1]})`}
        >
          <path
            d="M0,0 L-11,-24 A26,26 0 0 1 11,-24 Z"
            className="bay-plan-cone"
          />
          <circle r="4.6" />
        </g>
        <text
          x={scalarValue / 2}
          y={scalarValue2 + 7}
          className="bay-plan-label"
          textAnchor="middle"
        >
          ROLLER DOOR
        </text>
        <text
          x={scalarValue / 2}
          y={-1.5}
          className="bay-plan-label"
          textAnchor="middle"
          dy="-1"
        >
          MEZZANINE · DOCKS
        </text>
      </svg>
      <div className="bay-plan-side">
        <p className="bay-plan-where">
          <b>{where[0]}</b>
          {where[1]}
        </p>
        <ul className="bay-plan-legend">
          <li>
            <i className="is-you" />
            You
          </li>
          <li>
            <i className="is-todo" />
            To check
          </li>
          <li>
            <i className="is-seen" />
            Checked
          </li>
          <li>
            <i className="is-line" />
            Hot line
          </li>
        </ul>
      </div>
    </section>
  );
}

/** Front elevation of the PR-6, drawn to the model's proportions, with callouts. */
export function RegulatorSheet() {
  const state = 280,
    callback = (xPosition: number) => 190 + xPosition * state,
    callback2 = (yPosition: number) => 134 - yPosition * state,
    value = 0.016;
  const seg = (x0: number, x1: number, height: number) => ({
    x: callback(x0),
    y: callback2(value + height),
    width: (x1 - x0) * state,
    height: height * state,
  });
  const chev = (cx: number, cy: number) =>
    `${cx - 6},${cy - 7} ${cx + 4},${cy} ${cx - 6},${cy + 7} ${cx - 6},${cy + 3} ${cx - 1},${cy} ${cx - 6},${cy - 3}`;
  return (
    <figure
      className="bay-schem"
      aria-label="Annotated drawing of the power regulator"
    >
      <svg viewBox="0 0 380 186">
        {/* Cables first, behind the body. */}
        <path
          d={`M${callback(-0.57)},${callback2(value + 0.13)} C${callback(-0.68)},${callback2(0.12)} ${callback(-0.74)},${callback2(0.02)} ${callback(-0.62)},${callback2(0.005)}`}
          className="s-cable-y"
        />
        <path
          d={`M${callback(0.56)},${callback2(value + 0.13)} C${callback(0.63)},${callback2(0.12)} ${callback(0.64)},${callback2(0.03)} ${callback(0.665)},${callback2(0.005)}`}
          className="s-cable-k"
        />
        <path
          d={`M${callback(0.51)},${callback2(value + 0.05)} C${callback(0.56)},${callback2(0.05)} ${callback(0.58)},${callback2(0.005)} ${callback(0.63)},${callback2(0.003)}`}
          className="s-cable-y"
        />
        <rect {...seg(-0.4, -0.185, 0.215)} className="s-dark" />
        <rect {...seg(-0.18, 0.205, 0.255)} className="s-body" />
        <rect {...seg(0.21, 0.4, 0.228)} className="s-body" />
        <rect
          x={callback(-0.12)}
          y={callback2(value + 0.315) - 3}
          width={0.26 * state}
          height="5"
          rx="2.5"
          className="s-steel"
        />
        <rect
          x={callback(-0.36)}
          y={callback2(value + 0.279)}
          width={0.72 * state}
          height={0.024 * state}
          className="s-dark"
        />
        {/* End caps, connectors, glands. */}
        <rect
          {...seg(-0.46, -0.4, 0.19)}
          y={callback2(value + 0.205)}
          className="s-cap"
        />
        <rect
          {...seg(0.4, 0.46, 0.19)}
          y={callback2(value + 0.205)}
          className="s-cap"
        />
        <rect
          x={callback(-0.575)}
          y={callback2(value + 0.13) - 13}
          width={0.115 * state}
          height="26"
          rx="4"
          className="s-steel"
        />
        <rect
          x={callback(0.46)}
          y={callback2(value + 0.13) - 14}
          width={0.1 * state}
          height="28"
          rx="4"
          className="s-steel"
        />
        {/* Face plate, gauge and needle, chevron panel. */}
        <rect
          x={callback(-0.153)}
          y={callback2(value + 0.228)}
          width={0.33 * state}
          height={0.2 * state}
          rx="3"
          className="s-plate"
        />
        <circle
          cx={callback(-0.06)}
          cy={callback2(value + 0.13)}
          r={0.079 * state}
          className="s-bezel"
        />
        <circle
          cx={callback(-0.06)}
          cy={callback2(value + 0.13)}
          r={0.068 * state}
          className="s-face"
        />
        <line
          x1={callback(-0.06)}
          y1={callback2(value + 0.13)}
          x2={callback(-0.06) + 12}
          y2={callback2(value + 0.13) - 13}
          className="s-needle"
        />
        <rect
          x={callback(0.051)}
          y={callback2(value + 0.205)}
          width={0.088 * state}
          height={0.15 * state}
          className="s-plate"
        />
        {[-14, 0, 14].map((depth) => (
          <polygon
            key={depth}
            points={chev(callback(0.095), callback2(value + 0.13) + depth)}
            className="s-chev"
          />
        ))}
        {/* Spec plate and lamp. */}
        <rect
          x={callback(0.23)}
          y={callback2(value + 0.147)}
          width={0.15 * state}
          height={0.094 * state}
          className="s-spec"
        />
        {[0, 1, 2, 3].map((index) => (
          <line
            key={index}
            x1={callback(0.24)}
            x2={callback(0.36) - index * 6}
            y1={callback2(value + 0.125) + index * 5.5}
            y2={callback2(value + 0.125) + index * 5.5}
            className="s-text"
          />
        ))}
        <circle
          cx={callback(0.367)}
          cy={callback2(value + 0.19)}
          r="3"
          className="s-led"
        />
        <rect
          {...seg(-0.355, -0.235, 0.1)}
          y={callback2(value + 0.17)}
          className="s-plate"
        />
        <rect
          x={callback(-0.275)}
          y={callback2(value + 0.135)}
          width="11"
          height="12"
          className="s-chev"
        />
        {/* Callouts. */}
        {(
          [
            [
              callback(-0.06),
              callback2(value + 0.21),
              92,
              14,
              'Output gauge',
              '0–10 ×10 %',
            ],
            [
              callback(0.095),
              callback2(value + 0.205),
              196,
              14,
              'Warning panel',
              'Live output',
            ],
            [
              callback(0.3),
              callback2(value + 0.147),
              300,
              14,
              'Spec plate',
              'PR-6 · 48 V',
            ],
            [
              callback(-0.52),
              callback2(value + 0.13) + 13,
              30,
              170,
              'Signal plug',
              'To the bay',
            ],
            [
              callback(0.51),
              callback2(value + 0.13) + 14,
              318,
              170,
              'Main feed',
              'Cable gland',
            ],
          ] as [number, number, number, number, string, string][]
        ).map(([px, py, localX, localY, textValue, textValue2]) => (
          <g key={textValue} className="s-call">
            <polyline
              points={`${px},${py} ${px},${localY < 90 ? localY + 14 : localY - 18} ${localX},${localY < 90 ? localY + 14 : localY - 18}`}
            />
            <circle cx={px} cy={py} r="2.4" />
            <text x={localX} y={localY} textAnchor="middle">
              <tspan className="s-call-a">{textValue}</tspan>
              <tspan x={localX} dy="10" className="s-call-b">
                {textValue2}
              </tspan>
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
