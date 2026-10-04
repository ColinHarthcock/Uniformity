"use client";

import { useLayoutEffect, useRef, useState } from "react";

export function useElementWidth(minWidth = 260) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(minWidth);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      setWidth(Math.max(minWidth, Math.floor(element.clientWidth)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [minWidth]);

  return { ref, width };
}
