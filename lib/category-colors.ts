const categoryPalette = ['#e59469', '#5e9c75', '#638dbb', '#9575b8', '#d49355', '#cf6e82', '#4d9c9c', '#6575ca', '#ad875b', '#74888e'];

/** Pick the least-used palette color so new categories stay easy to distinguish. */
export function automaticCategoryColor(usedColors: string[]) {
  const counts = new Map<string, number>();
  for (const color of usedColors) {
    const key = color.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return categoryPalette.reduce((best, color) => (counts.get(color) || 0) < (counts.get(best) || 0) ? color : best);
}
