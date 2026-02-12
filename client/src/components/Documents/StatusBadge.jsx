export default function StatusBadge({ status }) {
  const map = {
    NEW: { text: <i className="fa-solid fa-file has-text-link fa-2x"></i>, color: "" },
    REVISION: { text: <i className="fa-solid fa-file-circle-question has-text-warning fa-2x"></i>, color: "" },
    REJECTED: { text: <i className="fa-solid fa-file-circle-xmark has-text-danger fa-2x"></i>, color: "" },
    SIGNED: { text: <i className="fa-solid fa-file-circle-check has-text-success fa-2x"></i>, color: "" },
  };

  const cfg = map[status] || { text: status, color: "" };

  return (
    <span className={`tag ${cfg.color}`}>
      {cfg.text}
    </span>
  );
}