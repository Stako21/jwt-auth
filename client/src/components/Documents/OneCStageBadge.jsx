import { getOneCStagePresentation } from "./oneCStage.js";
import style from "./OneCStageBadge.module.scss";

export default function OneCStageBadge({ stage, showLabel = false }) {
  const presentation = getOneCStagePresentation(stage);

  return (
    <span
      className={`${style.stage} ${style[presentation.tone]} ${
        showLabel ? style.withLabel : style.iconOnly
      }`}
      data-one-c-stage={presentation.value || undefined}
      data-label={presentation.label}
      aria-label={`Стан в УП: ${presentation.label}`}
      title={presentation.label}
      role="img"
      tabIndex={showLabel ? undefined : 0}
    >
      <i className={`fa-solid ${presentation.icon}`} aria-hidden="true" />
      {showLabel ? <span>{presentation.label}</span> : null}
    </span>
  );
}
