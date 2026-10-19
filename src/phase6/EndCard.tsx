import { useEffect, useRef } from 'react';
import './end-card.css';

const chapters = [
  ['The rupture', 'Thrown into a city that was almost home.'],
  ['The harbour', 'Found him where the crossing left him.'],
  ['The repairs', 'Rebuilt him, one piece at a time.'],
  ['Bay 6', 'Found a way to hold him back.'],
  ['The signal', 'Followed the voice that was missing.'],
  ['Home', 'Brought them both through the last gate.'],
];

export function EndCard({ onReplay }: { onReplay: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <section className="lg-ending" aria-labelledby="lg-ending-title">
    <div className="lg-ending-stage">
      <div className="lg-ending-title">
        <h1 ref={heading} tabIndex={-1} id="lg-ending-title">The Last Gate</h1>
        <p className="lg-ending-home">Home.</p>
      </div>
      <p className="lg-ending-line">
        <span className="lg-ending-speaker">Baymax</span>
        <span>Your heart rate is elevated, Hiro. I detect no injury. I believe this is relief.</span>
      </p>
    </div>
    <div className="lg-ending-band">
      <div className="lg-ending-road">
        <p className="lg-ending-label">The road back</p>
        <ol>{chapters.map(([title, text], i) => <li key={title}>
          <span className="lg-ending-num">0{i + 1}</span>
          <span className="lg-ending-chap">{title}</span>
          <span className="lg-ending-text">{text}</span>
        </li>)}</ol>
      </div>
      <div className="lg-ending-credits">
        <p className="lg-ending-label">Made by</p>
        <p className="lg-ending-team">Team Delhi Public School, Maruti Kunj</p>
        <p className="lg-ending-tech"><span>Technical</span> Rudraksh Dubey, Shivam S., Ojasvi Goswami</p>
        <p className="lg-ending-extras">Extras coming soon.</p>
        <button type="button" className="lg-ending-return" onClick={onReplay}>Return to the opening</button>
      </div>
    </div>
  </section>;
}
