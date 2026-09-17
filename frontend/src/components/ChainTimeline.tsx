import type { CustodyEvent } from "../types";

interface ChainTimelineProps {
  events: CustodyEvent[];
}

const HIGHLIGHT_EVENT_TYPES = new Set(["EARLY_ACCESS_ATTEMPT", "TAMPER_SUSPECTED"]);

export default function ChainTimeline({ events }: ChainTimelineProps) {
  if (events.length === 0) {
    return <p className="muted">No custody events yet.</p>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Event Type</th>
          <th>Actor Role</th>
          <th>Timestamp</th>
          <th>Hash (first 16 chars)</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => {
          const flagged = event.is_flagged === 1 || HIGHLIGHT_EVENT_TYPES.has(event.event_type);
          return (
            <tr key={event.id} className={flagged ? "row-flagged" : undefined}>
              <td>{event.event_type}</td>
              <td>{event.actor_role}</td>
              <td>{new Date(event.created_at).toLocaleString()}</td>
              <td>
                <code>{event.hash.slice(0, 16)}</code>
              </td>
              <td>{flagged && <span className="flagged-badge">FLAGGED</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
