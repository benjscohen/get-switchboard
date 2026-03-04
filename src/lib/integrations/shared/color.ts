/** Convert hex color string to normalized RGB (0–1 range) */
export function hexToRgb(hex: string): {
  red: number;
  green: number;
  blue: number;
} {
  const h = hex.replace("#", "");
  return {
    red: parseInt(h.substring(0, 2), 16) / 255,
    green: parseInt(h.substring(2, 4), 16) / 255,
    blue: parseInt(h.substring(4, 6), 16) / 255,
  };
}

/** Build an optional Google API color object from a hex string */
export function optColor(hex: string | undefined) {
  if (!hex) return undefined;
  return { color: { rgbColor: hexToRgb(hex) } };
}
