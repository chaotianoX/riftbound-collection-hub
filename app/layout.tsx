import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Riftbound Collection Hub", description: "An independent collection workspace." };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip" href="#content">Skip to content</a>{children}</body></html>;
}
