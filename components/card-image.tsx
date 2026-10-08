"use client";
import { useState } from "react";
import { displayImage, type ImageMetadata } from "@/lib/domain/images";
export function CardImage({ metadata, name }: { metadata: ImageMetadata | null; name: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = displayImage(metadata);
  if (!url || failedUrl === url) return <div className="card-placeholder" role="img" aria-label={`${name}: image unavailable`}><span aria-hidden="true">◇</span><p>No image available</p></div>;
  // URL is reviewed metadata. External image loading happens in the browser only.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="card-art" src={url} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />;
}
