export type ImageMetadata = {
  state: "pending" | "ready" | "error";
  usageVerified: boolean;
  authorizedUrl: string | null;
  checksum: string | null;
};
/** No inferred official asset URL, embedded image or unreviewed source. */
export function displayImage(metadata: ImageMetadata | null): string | null {
  if (!metadata || metadata.state !== "ready" || !metadata.usageVerified || !metadata.checksum || !metadata.authorizedUrl) return null;
  try {
    const url = new URL(metadata.authorizedUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
