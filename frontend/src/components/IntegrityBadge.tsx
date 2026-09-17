interface IntegrityBadgeProps {
  valid: boolean | null;
}

export default function IntegrityBadge({ valid }: IntegrityBadgeProps) {
  if (valid === null) {
    return <span className="badge badge-neutral">CHECKING…</span>;
  }
  return valid ? (
    <span className="badge badge-verified">VERIFIED</span>
  ) : (
    <span className="badge badge-tampered">TAMPERED</span>
  );
}
