"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// On route change, start from the top — unless navigating to an #anchor.
export default function ScrollTop() {
  const pathname = usePathname();
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
