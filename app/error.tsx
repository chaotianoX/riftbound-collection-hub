"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="content" className="loading"><h1>Workspace unavailable</h1><p role="alert">Something went wrong. Please try again.</p><button onClick={reset}>Retry</button></main>;
}
