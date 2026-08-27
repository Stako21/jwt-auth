import { useEffect, useState } from "react";
import FormSelect from "../FormControl/FormSelect.jsx";
import {
  applyTheme,
  getActiveTheme,
  THEME_CHANGE_EVENT,
  UI_THEMES,
} from "../../utils/theme.js";
import style from "./ThemeSelector.module.scss";

export default function ThemeSelector() {
  const [theme, setTheme] = useState(getActiveTheme);

  useEffect(() => {
    const syncTheme = (event) => {
      setTheme(event.detail?.theme || getActiveTheme());
    };

    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
  }, []);

  const handleChange = (event) => {
    setTheme(applyTheme(event.target.value));
  };

  return (
    <div className={style.themeSelector}>
      <label className={style.label} htmlFor="admin-theme-select">
        <i className="fa-solid fa-palette" aria-hidden="true" />
        <span>Тема інтерфейсу</span>
      </label>
      <FormSelect
        id="admin-theme-select"
        className={style.select}
        compact
        value={theme}
        onChange={handleChange}
      >
        {UI_THEMES.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </FormSelect>
    </div>
  );
}
