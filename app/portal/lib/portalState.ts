// app/portal/lib/portalState.ts
// Client-side state manager for member identification, localStorage caching,
// local workout set completions, and water tracking. Zero backend changes needed.

import { supabase } from "@/lib/supabase";
import type { PortalMember } from "../types";

const STORAGE_KEY = "psync_member_id";
const SETS_PREFIX = "psync_workout_sets_";
const WATER_PREFIX = "psync_water_";

export function getCachedMemberId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setCachedMemberId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Ignore storage quota errors
  }
}

export function clearCachedMemberId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/** Fetch member profile by UUID */
export async function fetchMemberById(id: string): Promise<PortalMember | null> {
  try {
    const res = await fetch(`/api/portal?m=${encodeURIComponent(id)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.member) return data.member;
    }
  } catch {}

  try {
    const { data, error } = await supabase
      .from("members")
      .select("*, branches(name, address, phone)")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) return null;
    return data as unknown as PortalMember;
  } catch {
    return null;
  }
}

/** Fetch member profile by 10-digit registered phone */
export async function fetchMemberByPhone(phone: string): Promise<PortalMember | null> {
  const clean = phone.replace(/\D/g, "");
  if (!clean) return null;

  try {
    const res = await fetch(`/api/portal?phone=${encodeURIComponent(clean)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.member) return data.member;
    }
  } catch {}

  try {
    // Try exact or with country code variations
    const { data, error } = await supabase
      .from("members")
      .select("*, branches(name, address, phone)")
      .or(`phone.eq.${clean},phone.eq.+91${clean},phone.ilike.%${clean}%`)
      .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0] as unknown as PortalMember;
  } catch {
    return null;
  }
}

/** Fetch full portal bundle */
export async function fetchPortalBundle(idOrPhone: string) {
  try {
    const isPhone = !idOrPhone.includes("-") && idOrPhone.length <= 15;
    const param = isPhone ? `phone=${encodeURIComponent(idOrPhone)}` : `m=${encodeURIComponent(idOrPhone)}`;
    const res = await fetch(`/api/portal?${param}`);
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

/** Local storage for sets completed today (resets each day) */
export function getCompletedSets(memberId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(`${SETS_PREFIX}${memberId}_${today}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function toggleCompletedSet(memberId: string, setKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  const today = new Date().toISOString().slice(0, 10);
  const current = getCompletedSets(memberId);
  if (current.has(setKey)) {
    current.delete(setKey);
  } else {
    current.add(setKey);
  }
  try {
    localStorage.setItem(`${SETS_PREFIX}${memberId}_${today}`, JSON.stringify([...current]));
  } catch {
    // Ignore
  }
  return current;
}

/** Local storage for daily water glasses (250ml each) */
export function getWaterGlasses(memberId: string): number {
  if (typeof window === "undefined") return 0;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(`${WATER_PREFIX}${memberId}_${today}`);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function setWaterGlasses(memberId: string, count: number): void {
  if (typeof window === "undefined") return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    localStorage.setItem(`${WATER_PREFIX}${memberId}_${today}`, String(Math.max(0, count)));
  } catch {
    // Ignore
  }
}
