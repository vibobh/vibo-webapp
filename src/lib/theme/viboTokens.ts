/**
 * Vibo themes — light (default) and dark.
 *
 * Semantic token rules (MUST follow everywhere):
 * - Light: icons use `iconPrimary` (#4a0315) on white.
 * - Dark: icons use `iconPrimary` (#FFFFFF) on black — never use maroon as icon/text on dark.
 */

const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

const borderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

const typography = {
  hero: { fontSize: 32, fontWeight: "700" as const },
  title: { fontSize: 24, fontWeight: "600" as const },
  subtitle: { fontSize: 18, fontWeight: "600" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
  caption: { fontSize: 14, fontWeight: "400" as const },
  label: { fontSize: 12, fontWeight: "500" as const },
} as const;

/** Light theme — default */
export const themeLight = {
  colors: {
    primary: "#551322",
    primaryLight: "#7a2438",
    primaryDark: "#4a0315",
    iconPrimary: "#4a0315",
    accent: "#551322",
    link: "#551322",
    secondary: "#5a5a5a",
    secondaryDark: "#333",
    background: "#FFFFFF",
    surface: "#F7F7F7",
    surfaceElevated: "#F1F1F1",
    text: "#000000",
    textSecondary: "#6B6B6B",
    textMuted: "#8E8E93",
    mention: "#007AFF",
    border: "#EAEAEA",
    error: "#ed4956",
    success: "#4a9c6d",
  },
  spacing,
  borderRadius,
  typography,
} as const;

/** Dark theme */
export const themeDark = {
  colors: {
    primary: "#551322",
    primaryLight: "#7a2438",
    primaryDark: "#4a0315",
    iconPrimary: "#FFFFFF",
    accent: "#551322",
    link: "#2596be",
    secondary: "#e8e4dc",
    secondaryDark: "#d4cfc4",
    background: "#000000",
    surface: "#121212",
    surfaceElevated: "#1A1A1A",
    text: "#FFFFFF",
    textSecondary: "#A1A1A1",
    textMuted: "#8E8E93",
    mention: "#0A84FF",
    border: "#2A2A2A",
    error: "#f87171",
    success: "#6ee7a0",
  },
  spacing,
  borderRadius,
  typography,
} as const;

export type Theme = typeof themeLight | typeof themeDark;

export type ResolvedTheme = "light" | "dark";

export function iconPrimaryForTheme(resolved: ResolvedTheme): string {
  return resolved === "dark"
    ? themeDark.colors.iconPrimary
    : themeLight.colors.iconPrimary;
}
