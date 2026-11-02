import type { Metadata } from "next";
import "./global.css";
import { Bricolage_Grotesque, Schibsted_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";
import SessionProvider from "@/components/trading-journal/SessionProvider";

const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });

export const metadata: Metadata = {
  title: "AuraJournal",
  description: "Your trading journal: where your P&L comes from, and where it leaks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark font-sans", schibsted.variable, bricolage.variable)}>
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
