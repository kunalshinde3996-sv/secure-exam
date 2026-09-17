import type { Role } from "../types";

const ROLE_COLORS: Record<Role, { bg: string; text: string }> = {
  EXAM_BOARD: { bg: "#ede7f6", text: "#4527a0" },
  PRESS: { bg: "#fff3e0", text: "#e65100" },
  DISTRIBUTION_CENTER: { bg: "#e0f2f1", text: "#00695c" },
  INVIGILATOR: { bg: "#e3f2fd", text: "#1565c0" },
};

interface RoleBadgeProps {
  role: Role;
}

export default function RoleBadge({ role }: RoleBadgeProps) {
  const { bg, text } = ROLE_COLORS[role];
  return (
    <span className="badge" style={{ backgroundColor: bg, color: text }}>
      {role}
    </span>
  );
}
