import type { Metadata } from "next";
import { Fraunces, Inter, Space_Mono } from "next/font/google";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", weight: ["300", "400", "500"], style: ["normal", "italic"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = Space_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Patch Notes — your community, shipped like a live-service game",
  description:
    "Weekly patch notes for your community: meta report, buffs & nerfs, rising champions, fan of the patch — generated from real FanBase MCP data and diffed week over week.",
  openGraph: {
    title: "Patch Notes",
    description: "Run your community like a live-service game. Ship its patch notes.",
    type: "website",
  },
};

const themeInit = `try{var t=localStorage.getItem('pn-theme');if(t==='light'||(!t&&matchMedia('(prefers-color-scheme: light)').matches)){document.documentElement.classList.add('light')}}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-body bg-void text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
