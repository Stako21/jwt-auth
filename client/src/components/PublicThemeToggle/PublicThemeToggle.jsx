import { useEffect, useState } from "react";
import cn from "classnames";
import {
  applyTheme,
  CYAN_DARK_THEME,
  CYAN_LIGHT_THEME,
  getActiveTheme,
  THEME_CHANGE_EVENT,
} from "../../utils/theme.js";
import style from "./PublicThemeToggle.module.scss";

export default function PublicThemeToggle({
  className,
  compact = false,
}) {
  const [theme, setTheme] = useState(getActiveTheme);
  const isDark = theme.endsWith("-dark");

  useEffect(() => {
    const syncTheme = (event) => {
      setTheme(event.detail?.theme || getActiveTheme());
    };

    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
  }, []);

  const toggleTheme = () => {
    setTheme(applyTheme(isDark ? CYAN_LIGHT_THEME : CYAN_DARK_THEME));
  };

  return (
    <button
      className={cn(style.toggle, className, {
        [style.compact]: compact,
      })}
      type="button"
      aria-label={isDark ? "Увімкнути світлу тему" : "Увімкнути темну тему"}
      aria-pressed={isDark}
      onClick={toggleTheme}
    >
      <span className={cn(style.option, { [style.active]: !isDark })}>
        <i className="fa-regular fa-sun" aria-hidden="true"></i>
        <span className={style.optionLabel}>Light</span>
      </span>
      <span className={cn(style.option, { [style.active]: isDark })}>
        <i className="fa-regular fa-moon" aria-hidden="true"></i>
        <span className={style.optionLabel}>Dark</span>
      </span>
    </button>
  );
}
