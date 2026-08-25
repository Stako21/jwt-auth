import { useEffect, useState } from "react";
import { UI_TIMING } from "../../uiTokens";
import style from "./StatusBadge.module.scss";

const STATUS_CONFIG = {
  NEW: { label: "Новий", icon: "fa-file", className: style.new },
  PREPARED: {
    label: "Погоджено",
    icon: "fa-file-signature",
    className: style.prepared,
  },
  REVISION: {
    label: "На доопрацювання",
    icon: "fa-file-circle-question",
    className: style.revision,
  },
  REJECTED: {
    label: "Відхилено",
    icon: "fa-file-circle-xmark",
    className: style.rejected,
  },
  SIGNED: {
    label: "Підписано",
    icon: "fa-file-circle-check",
    className: style.signed,
  },
};

export default function StatusBadge({ status }) {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const config = STATUS_CONFIG[status] || {
    label: status || "Невідомий статус",
    icon: "fa-file-circle-question",
    className: style.unknown,
  };

  useEffect(() => {
    if (!isTooltipOpen) return undefined;
    const timeout = window.setTimeout(
      () => setIsTooltipOpen(false),
      UI_TIMING.statusTooltipTimeoutMs,
    );
    return () => window.clearTimeout(timeout);
  }, [isTooltipOpen]);

  return (
    <button
      className={`${style.statusIndicator} ${config.className}`}
      type="button"
      aria-label={`Статус: ${config.label}`}
      data-label={config.label}
      data-open={isTooltipOpen}
      onClick={(event) => {
        event.stopPropagation();
        setIsTooltipOpen((open) => !open);
      }}
      onBlur={() => setIsTooltipOpen(false)}
    >
      <i className={`fa-solid ${config.icon}`} aria-hidden="true"></i>
    </button>
  );
}
