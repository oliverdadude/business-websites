"use client";
// Cart lives in localStorage (item ids + quantities only). Prices always come from the server.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PublicQuote } from "@/lib/catalog-core";

export interface CartLine {
  itemId: string;
  quantity: number;
  name?: string;
}

const KEY = "prx-cart-v1";
const EVENT = "prx-cart-change";
let cachedRaw: string | null = null;
let cached: CartLine[] = [];
const EMPTY: CartLine[] = [];

function read(): CartLine[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const v = JSON.parse(raw ?? "[]");
    cached = Array.isArray(v)
      ? v
          .filter((l) => l && typeof l.itemId === "string" && Number.isInteger(l.quantity) && l.quantity > 0)
          .map((l) => ({ itemId: l.itemId, quantity: Math.min(l.quantity, 1_000_000), name: typeof l.name === "string" ? l.name : undefined }))
      : [];
  } catch {
    cached = [];
  }
  return cached;
}

function write(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useCart() {
  const lines = useSyncExternalStore(subscribe, read, () => EMPTY);
  const setQty = useCallback((itemId: string, quantity: number) => {
    const cur = read();
    write(quantity > 0 ? cur.map((l) => (l.itemId === itemId ? { ...l, quantity } : l)) : cur.filter((l) => l.itemId !== itemId));
  }, []);
  const add = useCallback((itemId: string, quantity: number, name?: string) => {
    const cur = read();
    const ex = cur.find((l) => l.itemId === itemId);
    write(
      ex
        ? cur.map((l) => (l.itemId === itemId ? { ...l, quantity: Math.min(1_000_000, l.quantity + quantity), name: name ?? l.name } : l))
        : [...cur, { itemId, quantity, name }],
    );
  }, []);
  const remove = useCallback((itemId: string) => write(read().filter((l) => l.itemId !== itemId)), []);
  const clear = useCallback(() => write([]), []);
  return { lines, add, setQty, remove, clear };
}

/** Debounced server quote for a set of lines. */
export function useQuote(lines: { itemId: string; quantity: number }[], delay = 250) {
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const key = JSON.stringify(lines.map((l) => [l.itemId, l.quantity]));

  const run = useCallback(async () => {
    const id = ++seq.current;
    const body = JSON.parse(key) as [string, number][];
    if (body.length === 0) {
      setQuote(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/cart/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: body.map(([itemId, quantity]) => ({ itemId, quantity })) }),
      });
      const data = await res.json();
      if (id !== seq.current) return;
      if (!res.ok) throw new Error(data.error ?? "Could not price your cart");
      setQuote(data);
      setError(null);
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : "Could not price your cart");
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    const t = setTimeout(run, delay);
    return () => clearTimeout(t);
  }, [run, delay]);

  return { quote, loading, error, refresh: run };
}
