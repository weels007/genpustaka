"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createClient, chains } from "genlayer-js";

const WalletCtx = createContext(null);
export const useWallet = () => useContext(WalletCtx);

const LS_KEY = "genpustaka-wallet-uuid";

function safeGet(k) {
  try { return window.localStorage.getItem(k); } catch { return null; }
}
function safeSet(k, v) {
  try { window.localStorage.setItem(k, v); } catch { /* ignore */ }
}
function safeDel(k) {
  try { window.localStorage.removeItem(k); } catch { /* ignore */ }
}

// EIP-6963 multi-wallet discovery: no race on window.ethereum,
// the user explicitly picks MetaMask / Rabby / others.
function discoverProviders(timeoutMs = 600) {
  return new Promise((resolve) => {
    if (typeof window === "undefined") { resolve([]); return; }
    const found = new Map();
    const onAnnounce = (e) => {
      const d = e.detail;
      if (d?.info?.uuid && d?.provider) found.set(d.info.uuid, d);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      if (found.size === 0 && window.ethereum) {
        const inj = window.ethereum;
        const name = inj.isRabby ? "Rabby" : inj.isMetaMask ? "MetaMask" : "Browser Wallet";
        found.set("injected", { info: { uuid: "injected", name, icon: "", rdns: "" }, provider: inj });
      }
      resolve([...found.values()]);
    }, timeoutMs);
  });
}

export function WalletProvider({ children }) {
  const [providers, setProviders] = useState([]);
  const [address, setAddress] = useState(null);
  const [providerName, setProviderName] = useState("");
  const [providerUuid, setProviderUuid] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | error
  const [error, setError] = useState("");
  const providerRef = useRef(null);
  const clientRef = useRef(null);
  const listenersRef = useRef(null);

  const detachListeners = useCallback(() => {
    const { prov, onAcc, onChain } = listenersRef.current || {};
    try {
      if (prov?.removeListener) {
        if (onAcc) prov.removeListener("accountsChanged", onAcc);
        if (onChain) prov.removeListener("chainChanged", onChain);
      }
    } catch { /* ignore */ }
    listenersRef.current = null;
  }, []);

  const attachListeners = useCallback((prov) => {
    detachListeners();
    if (!prov?.on) return;
    const onAcc = (accs) => {
      if (!accs || accs.length === 0) {
        setAddress(null); setProviderUuid(null); setProviderName("");
        setStatus("idle"); clientRef.current = null; providerRef.current = null;
        safeDel(LS_KEY);
      } else {
        setAddress(accs[0]);
      }
    };
    const onChain = () => { clientRef.current = null; }; // force client rebuild on next use
    try {
      prov.on("accountsChanged", onAcc);
      prov.on("chainChanged", onChain);
      listenersRef.current = { prov, onAcc, onChain };
    } catch { /* ignore */ }
  }, [detachListeners]);

  // Build (and cache) a genlayer write-client signing through the wallet.
  const getWriteClient = useCallback(async () => {
    if (!providerRef.current || !address) throw new Error("Wallet not connected.");
    if (!clientRef.current) {
      const client = createClient({ chain: chains.studionet, account: address, provider: providerRef.current });
      if (typeof client.connect === "function") {
        try { await client.connect("studionet"); } catch { /* wallet may already be on studionet */ }
      }
      clientRef.current = client;
    }
    return clientRef.current;
  }, [address]);

  const connect = useCallback(async (uuid, { silent = false } = {}) => {
    const found = providersRef.current.find((p) => p.info.uuid === uuid);
    if (!found) throw new Error("Wallet not found. Is it installed and unlocked?");
    const prov = found.provider;
    setError("");
    if (!silent) setStatus("connecting");
    try {
      const accs = await prov.request({ method: silent ? "eth_accounts" : "eth_requestAccounts" });
      if (!accs || accs.length === 0) {
        if (!silent) { setStatus("idle"); setError("No account authorized in the wallet."); }
        return null;
      }
      providerRef.current = prov;
      clientRef.current = null;
      attachListeners(prov);
      setAddress(accs[0]);
      setProviderName(found.info.name || "Wallet");
      setProviderUuid(uuid);
      setStatus("connected");
      safeSet(LS_KEY, uuid);
      return accs[0];
    } catch (e) {
      if (!silent) {
        setStatus("error");
        setError(e?.code === 4001 ? "Connection cancelled in the wallet." : "Connect failed: " + String(e?.message || e).split("\n")[0]);
      }
      return null;
    }
  }, [attachListeners]);

  const providersRef = useRef([]);
  providersRef.current = providers;

  const disconnect = useCallback(() => {
    detachListeners();
    providerRef.current = null;
    clientRef.current = null;
    setAddress(null); setProviderName(""); setProviderUuid(null);
    setStatus("idle"); setError("");
    safeDel(LS_KEY);
  }, [detachListeners]);

  // Discover wallets on mount + silent reconnect of the last used one.
  useEffect(() => {
    let live = true;
    (async () => {
      const list = await discoverProviders();
      if (!live) return;
      setProviders(list);
      providersRef.current = list;
      const last = safeGet(LS_KEY);
      if (last && list.some((p) => p.info.uuid === last)) {
        try {
          const found = list.find((p) => p.info.uuid === last);
          const accs = await found.provider.request({ method: "eth_accounts" });
          if (live && accs?.length) {
            providerRef.current = found.provider;
            attachListeners(found.provider);
            setAddress(accs[0]);
            setProviderName(found.info.name || "Wallet");
            setProviderUuid(last);
            setStatus("connected");
          }
        } catch { /* stay disconnected */ }
      }
    })();
    return () => { live = false; };
  }, [attachListeners]);

  return (
    <WalletCtx.Provider value={{ providers, address, providerName, providerUuid, status, error, connect, disconnect, getWriteClient }}>
      {children}
    </WalletCtx.Provider>
  );
}
