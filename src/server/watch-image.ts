/** Only raster assets supported by the watch; no data URLs or inline media. */
export function watchImagePath(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (!candidate || candidate.length > 2048 || candidate.startsWith("//")) continue;
    try {
      const url = new URL(candidate, "https://www.traknio.com");
      if (url.protocol !== "https:" || url.username || url.password) continue;
      if (!candidate.startsWith("/") && !candidate.startsWith("https://")) continue;
      if (/\.(png|jpe?g|webp|gif)$/i.test(url.pathname)) return candidate;
    } catch { /* Ignore malformed or unsupported media. */ }
  }
  return null;
}
