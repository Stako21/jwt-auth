import { getTroCancellationWarning } from "./troCancellation.js";
import styles from "./TroCancellationNotice.module.scss";

export default function TroCancellationNotice({ document, compact = false, onOpen }) {
  const warning = getTroCancellationWarning(document);
  if (!warning) return null;
  if (compact) {
    return (
      <button type="button" className={styles.indicator} title={warning.message}
        aria-label={`${warning.title}. ${warning.message}`} onClick={onOpen}>
        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      </button>
    );
  }
  return (
    <div className={styles.notice} role="note" aria-label={warning.title}>
      <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <div><strong>{warning.title}</strong><p>{warning.message}</p></div>
    </div>
  );
}
