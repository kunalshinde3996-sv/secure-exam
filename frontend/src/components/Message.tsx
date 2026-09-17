interface MessageProps {
  type: "success" | "error";
  text: string;
}

export default function Message({ type, text }: MessageProps) {
  if (!text) return null;
  return <div className={`message message-${type}`}>{text}</div>;
}
