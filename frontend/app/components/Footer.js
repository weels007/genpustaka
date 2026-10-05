"use client";

import { BUILD_ID } from "../../lib/genlayer";

export default function Footer() {
  return (
    <footer>
      GenPustaka — crowd-sourced knowledge, verified by AI consensus on GenLayer.
      <span style={{ opacity: 0.45 }}> · build {BUILD_ID}</span>
    </footer>
  );
}
