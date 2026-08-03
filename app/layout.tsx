import type { Metadata } from "next";
import { Caveat, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
const handwritten = Caveat({ variable: "--font-hand", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PulseClass — Every voice in the room",
  description: "Create live quizzes, polls, and classroom moments that bring every student into the conversation.",
  icons: { icon: "/favicon.svg" },
  openGraph: { title: "PulseClass", description: "Every voice in the room. Live.", images: [{ url: "/og.png", width: 1734, height: 907 }] },
  twitter: { card: "summary_large_image", title: "PulseClass", description: "Every voice in the room. Live.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${sans.variable} ${mono.variable} ${handwritten.variable}`}>{children}</body></html>;
}
