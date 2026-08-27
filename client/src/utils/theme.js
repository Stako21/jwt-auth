export const THEME_STORAGE_KEY = "ui-theme";
export const THEME_CHANGE_EVENT = "ui-theme-change";
export const DEFAULT_THEME = "cyan-light";
export const CYAN_DARK_THEME = "cyan-dark";
export const CYAN_LIGHT_THEME = "cyan-light";

export const UI_THEMES = [
  { value: "emerald-dark", label: "Emerald — темна" },
  { value: "cyan-dark", label: "Cyan — темна" },
  { value: "emerald-light", label: "Emerald — світла" },
  { value: "cyan-light", label: "Cyan — світла" },
];

const THEME_NAMES = new Set(UI_THEMES.map(({ value }) => value));

export function normalizeTheme(theme) {
  return THEME_NAMES.has(theme) ? theme : DEFAULT_THEME;
}

export function getActiveTheme() {
  if (typeof document === "undefined") return DEFAULT_THEME;
  return normalizeTheme(document.documentElement.dataset.uiTheme);
}

export function applyTheme(theme) {
  const nextTheme = normalizeTheme(theme);

  if (typeof document !== "undefined") {
    document.documentElement.dataset.uiTheme = nextTheme;
    document.documentElement.dataset.theme = nextTheme.endsWith("-light")
      ? "light"
      : "dark";
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Theme still applies when storage is unavailable.
    }

    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: nextTheme } }),
    );
  }

  return nextTheme;
}
