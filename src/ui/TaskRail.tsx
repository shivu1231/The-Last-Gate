import './theme.css';
import './task-rail.css';

/**
 * The left task panel shared by every phase where Hiro has jobs to do. Each task is a row with a
 * short title, its state and, while it's open, one button that does it. The open row can carry a
 * hint, and the rail can end with a short list of notes (what Hiro has found so far).
 */
export type RailTask = {
  id: string;
  title: string;
  /** One short line under the title: progress, or why it's not open yet. */
  detail?: string;
  /** Shown only while the task is open: a nudge in Hiro's words. */
  hint?: string;
  state: 'locked' | 'open' | 'done';
  action?: { label: string; onClick: () => void; disabled?: boolean };
};
export type RailNotes = { title: string; items: string[]; max?: number };

/**
 * Render the shared chapter task rail and its current/completed states.
 */
export function TaskRail({
  kicker,
  heading,
  tasks,
  notes,
  className = '',
}: {
  kicker: string;
  heading: string;
  tasks: RailTask[];
  notes?: RailNotes;
  className?: string;
}) {
  const done = tasks.filter(
    (task) => task.state === 'done',
  ).length;
  const shown = notes ? notes.items.slice(-(notes.max ?? 4)) : [];
  return (
    <aside className={`lg-rail ${className}`} aria-label="Tasks">
      <header className="lg-rail-head">
        <p className="lg-rail-kicker">
          {kicker}
          <span>
            {done}/{tasks.length}
          </span>
        </p>
        <h2>{heading}</h2>
        <div className="lg-rail-meter" aria-hidden="true">
          <i style={{ width: `${(done / tasks.length) * 100}%` }} />
        </div>
      </header>
      <ol className="lg-rail-list">
        {tasks.map((task, index) => (
          <li key={task.id} className="lg-task" data-state={task.state}>
            <span className="lg-task-mark" aria-hidden="true">
              {task.state === 'done' ? '✓' : String(index + 1).padStart(2, '0')}
            </span>
            <div className="lg-task-text">
              <b>{task.title}</b>
              {task.detail && <small>{task.detail}</small>}
            </div>
            {task.state === 'open' && task.action && (
              <button
                className="lg-pill lg-pill-small"
                disabled={task.action.disabled}
                onClick={task.action.onClick}
              >
                {task.action.label}
              </button>
            )}
            {task.state === 'done' && (
              <span className="lg-task-chip">Done</span>
            )}
            {task.state === 'open' && task.hint && (
              <p className="lg-task-hint">{task.hint}</p>
            )}
            <span className="sr-only">
              {task.state === 'done'
                ? 'done'
                : task.state === 'open'
                  ? 'to do'
                  : 'not yet'}
            </span>
          </li>
        ))}
      </ol>
      {notes && shown.length > 0 && (
        <section className="lg-rail-notes" aria-label={notes.title}>
          <p className="lg-rail-kicker">
            {notes.title}
            <span>{notes.items.length}</span>
          </p>
          <ul>
            {shown.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
