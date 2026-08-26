export const THEME_STORAGE_KEY = "ui-theme";
export const DEFAULT_THEME = "emerald-dark";

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
  }

  return nextTheme;
}
