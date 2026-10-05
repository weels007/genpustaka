"use client";

import { WalletProvider } from "../../lib/wallet";

export default function Providers({ children }) {
  return <WalletProvider>{children}</WalletProvider>;
}
