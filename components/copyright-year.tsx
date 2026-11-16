"use client";

import { useEffect, useState } from "react";

/**
 * Copyright year, rendered on the client.
 * `new Date()` is not allowed during prerendering with Cache Components
 * enabled (Next 16) — not even in a Client Component's render — so the
 * year is read in an effect and filled in after hydration.
 */
export default function CopyrightYear() {
  const [year, setYear] = useState<number | null>(null);

  // Intentional: Next 16 (Cache Components) forbids reading `new Date()`
  // during render — even in a Client Component — so the year is read here,
  // once, after mount. This is the "defer" fix from Next's own error
  // message, not a state sync: the value never changes after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYear(new Date().getFullYear());
  }, []);

  return <>{year ?? ""}</>;
}
