const formatTypingText = (users: string[]) => {
  if (users.length === 1) return `${users[0]} is typing...`;
  if (users.length === 2) return `${users[0]} and ${users[1]} is typing...`;
  return `${users.slice(0, -1).join(", ")} and ${users[users.length - 1]} is typing...`;
};

interface Props {
  typingUsers: string[];
}

export default function TypingIndicator({ typingUsers }: Props) {
  if (typingUsers.length === 0) return null;
  return (
    <div style={{
      padding: "0.25rem 1.5rem 0.125rem",
      display: "flex", alignItems: "center", gap: "0.4rem",
      fontSize: "0.8rem", color: "var(--text-muted)",
      flexShrink: 0,
    }}>
      <span style={{ display: "flex", gap: "3px", alignItems: "center" }}>
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
      <span>{formatTypingText(typingUsers)}</span>
    </div>
  );
}
