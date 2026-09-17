const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PRINTED: { bg: "#f5f5f5", text: "#555555" },
  SEALED: { bg: "#e3f2fd", text: "#1565c0" },
  DISPATCHED: { bg: "#fff3e0", text: "#e65100" },
  RECEIVED_AT_CENTER: { bg: "#e0f2f1", text: "#00695c" },
  OPENED: { bg: "#e8f5e9", text: "#2e7d32" },
  EARLY_ACCESS_ATTEMPT: { bg: "#ffebee", text: "#c62828" },
  CENTER_CONFIRMED: { bg: "#ede7f6", text: "#4527a0" },
  TAMPERED: { bg: "#ffebee", text: "#c62828" },
};

const DEFAULT_COLORS = { bg: "#f5f5f5", text: "#555555" };

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { bg, text } = STATUS_COLORS[status] ?? DEFAULT_COLORS;
  return (
    <span className="badge" style={{ backgroundColor: bg, color: text }}>
      {status}
    </span>
  );
}
