import { Galada, Inter, Manrope, Outfit } from "next/font/google";
import "./globals.css";
import ScrollTop from "./components/ScrollTop";
import Providers from "./components/Providers";

const galada = Galada({ subsets: ["latin"], weight: "400", variable: "--font-galada" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata = {
  title: "GenPustaka | Crowd-sourced Knowledge on GenLayer",
  description: "Find new information, summarize it, earn rewards. Every entry verified by decentralized AI validators on GenLayer.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className={`${inter.variable} ${galada.variable} ${manrope.variable} ${outfit.variable}`}>
        <ScrollTop />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
