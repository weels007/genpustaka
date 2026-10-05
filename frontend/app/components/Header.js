"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectWallet from "./ConnectWallet";

const LINKS = [
  ["/", "Home"],
  ["/explore", "Explore"],
  ["/submit", "Submit"],
  ["/leaderboard", "Leaderboard"],
  ["/contract", "Contract"],
];

export default function Header() {
  const pathname = usePathname();
  return (
    <header className="header">
      <div className="logo">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M9 8h7M9 11.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span>GenPustaka</span>
      </div>
      <nav className="nav">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className={`nav-item${pathname === href ? " active" : ""}`}>
            {label}
          </Link>
        ))}
      </nav>
      <ConnectWallet />
    </header>
  );
}
