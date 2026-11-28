"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  LayoutGrid, Users, UserCheck, CalendarDays, Dumbbell, Salad,
  Wallet, Ticket, BarChart2, Settings, LogOut, Menu, ChevronRight, ChevronDown,
  ChefHat, UserPlus, UsersRound, ClipboardList, PanelLeftClose, PanelLeftOpen, Library, Carrot,
  Pencil, Sun, Moon, Crown, RefreshCw, Home, SlidersHorizontal, CalendarClock, ShoppingBag, Sparkles,
  MessageSquare, Bell, Activity, MessageSquareHeart, LifeBuoy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { uploadToCloudflareR2 } from "@/lib/r2-client";
import { Sheet } from "./Sheet";
import { useRole } from "./useRole";
import { SidebarStyles } from "./DesignSystem";
import {
  applyBrand, cacheBrand, readCachedBrand, resolveBrand,
  BRAND_SAVED_EVENT, ORG_UPDATED_EVENT, THEME_EVENT, THEME_KEY,
  getStoredTheme, applyTheme, toggleTheme, createBrandFromLogo,
  emitBrandSaved, emitOrgUpdated, readCachedOrgLogo, cacheOrgLogo, saveOrgToServer,
  type Brand, type OrgUpdate,
} from "./brand";

const supabase = createClient();

/* ──────────────────────────────────────────────────────────────────────────
   Navigation model
   A section holds entries. An entry is either a link, or a group (submenu) of links.
   ────────────────────────────────────────────────────────────────────────── */

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; permKey?: string };
type NavGroup = { key: string; label: string; icon: LucideIcon; children: NavItem[] };
type NavEntry = NavItem | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

const OVERVIEW: NavItem   = { href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true };
const MEMBERS: NavItem    = { href: "/dashboard/members", label: "Members", icon: Users, permKey: "members" };
const ATTENDANCE: NavItem = { href: "/dashboard/attendance", label: "Members attendance", icon: UserCheck, permKey: "attendance" };
const PENDING_BALANCE: NavItem = { href: "/dashboard/renewals", label: "Pending balance", icon: RefreshCw, permKey: "members" };
const MEMBER_REPORTS_SETTINGS: NavItem = { href: "/dashboard/members/reports-and-settings", label: "Reports & settings", icon: SlidersHorizontal, permKey: "members" };

// Marketing
const LEADS: NavItem            = { href: "/dashboard/leads", label: "Leads", icon: UserPlus, permKey: "leads" };
const LEADS_FOLLOW_UPS: NavItem = { href: "/dashboard/marketing/follow-ups", label: "Leads follow ups", icon: CalendarClock, permKey: "leads" };
const PROGRAMS: NavItem         = { href: "/dashboard/marketing/programs", label: "Programs", icon: Sparkles, permKey: "leads" };
const PRODUCT_LISTING: NavItem  = { href: "/dashboard/marketing/products", label: "Product listing", icon: ShoppingBag, permKey: "leads" };
const MARKETING_REPORTS_SETTINGS: NavItem = { href: "/dashboard/marketing/reports-and-settings", label: "Reports & settings", icon: SlidersHorizontal, permKey: "leads" };

// Nutrition (Section placed above Workouts)
const DIET: NavItem       = { href: "/dashboard/diet", label: "Diet plans", icon: Salad, permKey: "diet" };
const RECIPES: NavItem    = { href: "/dashboard/diet/recipes", label: "Recipe library", icon: ChefHat, permKey: "recipes" };
const INGREDIENTS: NavItem = { href: "/dashboard/diet/ingredients", label: "Ingredients", icon: Carrot, permKey: "recipes" };
const TEMPLATES: NavItem  = { href: "/dashboard/diet/templates", label: "Diet templates", icon: ClipboardList, permKey: "diet" };
const NUTRITION_REPORTS_SETTINGS: NavItem = { href: "/dashboard/diet/reports-and-settings", label: "Reports & settings", icon: SlidersHorizontal, permKey: "diet" };

// Workouts
const EXERCISE_PLANS: NavItem     = { href: "/dashboard/workouts", label: "Exercise plans", icon: Dumbbell, permKey: "workouts" };
const EXERCISES: NavItem          = { href: "/dashboard/workouts/exercises", label: "Exercises", icon: Library, permKey: "workouts" };
const EXERCISE_TEMPLATES: NavItem = { href: "/dashboard/workouts/templates", label: "Exercise templates", icon: ClipboardList, permKey: "workouts" };
const WORKOUTS_REPORTS_SETTINGS: NavItem = { href: "/dashboard/workouts/reports-and-settings", label: "Reports & settings", icon: SlidersHorizontal, permKey: "workouts" };
const WORKOUTS = EXERCISE_PLANS;

// Coaching
const CLASSES_CALENDAR: NavItem = { href: "/dashboard/classes", label: "Calendar", icon: CalendarDays, permKey: "classes" };
const ACTIVE_BOOKINGS: NavItem  = { href: "/dashboard/classes/bookings", label: "Active bookings", icon: Ticket, permKey: "classes" };
const COACHING_REPORTS_SETTINGS: NavItem = { href: "/dashboard/classes/reports-and-settings", label: "Reports & settings", icon: SlidersHorizontal, permKey: "classes" };
const CLASSES = CLASSES_CALENDAR;

// Staff
const STAFF: NavItem                  = { href: "/dashboard/staff", label: "Staff", icon: UsersRound };
const STAFF_ATTENDANCE: NavItem       = { href: "/dashboard/staff/attendance", label: "Staff attendance", icon: UserCheck };
const STAFF_PAYROLL: NavItem          = { href: "/dashboard/staff/payroll", label: "Payroll", icon: Wallet };
const STAFF_REPORTS_SETTINGS: NavItem = { href: "/dashboard/staff/reports-and-settings", label: "Reports & settings", icon: SlidersHorizontal };

// Finance & Admin
const PAYMENTS: NavItem   = { href: "/dashboard/payments", label: "Payments", icon: Wallet, permKey: "payments" };
const PLANS: NavItem      = { href: "/dashboard/membership-plans", label: "Membership plans", icon: Ticket, permKey: "membership_plans" };
const RENEWALS: NavItem   = PENDING_BALANCE;
const REPORTS: NavItem    = { href: "/dashboard/reports", label: "Reports", icon: BarChart2, permKey: "reports" };
const FINANCE_REPORTS_SETTINGS: NavItem = { href: "/dashboard/finance/reports-and-settings", label: "Reports & settings", icon: SlidersHorizontal, permKey: "reports" };
const SETTINGS: NavItem   = { href: "/dashboard/settings", label: "Settings", icon: Settings, permKey: "settings" };
const MEMBERSHIP: NavItem = { href: "/dashboard/membership", label: "Subscription", icon: Crown };

// Notifications
const WA_NOTIFICATIONS: NavItem = { href: "/dashboard/notifications/whatsapp", label: "WA notification", icon: MessageSquare };
const APP_NOTIFICATIONS: NavItem = { href: "/dashboard/notifications/app", label: "App notifications", icon: Bell };
const NOTIFICATIONS_ACTIVITY: NavItem = { href: "/dashboard/notifications/activity", label: "Activity", icon: Activity };
const NOTIFICATIONS_REPORTS_SETTINGS: NavItem = { href: "/dashboard/notifications/reports-and-settings", label: "Reports & settings", icon: SlidersHorizontal };

// Feedback
const FEEDBACK: NavItem = { href: "/dashboard/feedback", label: "Feedback", icon: MessageSquareHeart };

// Enquiry & Support
const ENQUIRY: NavItem = { href: "/dashboard/enquiry", label: "Enquiry", icon: LifeBuoy };

const BILLING: NavGroup   = { key: "billing", label: "Billing", icon: Wallet, children: [PAYMENTS, PLANS] };

const SECTIONS_DEF: { title: string; entries: NavEntry[] }[] = [
  { title: "Membership", entries: [MEMBERS, ATTENDANCE, PENDING_BALANCE, PLANS, MEMBER_REPORTS_SETTINGS] },
  { title: "Marketing",  entries: [LEADS, LEADS_FOLLOW_UPS, PROGRAMS, PRODUCT_LISTING, MARKETING_REPORTS_SETTINGS] },
  { title: "Nutrition",  entries: [DIET, RECIPES, INGREDIENTS, TEMPLATES, NUTRITION_REPORTS_SETTINGS] },
  { title: "Workouts",   entries: [EXERCISE_PLANS, EXERCISES, EXERCISE_TEMPLATES, WORKOUTS_REPORTS_SETTINGS] },
  { title: "Coaching",   entries: [CLASSES_CALENDAR, ACTIVE_BOOKINGS, COACHING_REPORTS_SETTINGS] },
  { title: "Staff",      entries: [STAFF, STAFF_ATTENDANCE, STAFF_PAYROLL, STAFF_REPORTS_SETTINGS] },
  { title: "Finance",    entries: [BILLING, REPORTS, FINANCE_REPORTS_SETTINGS] },
  { title: "Notifications", entries: [WA_NOTIFICATIONS, APP_NOTIFICATIONS, NOTIFICATIONS_ACTIVITY, NOTIFICATIONS_REPORTS_SETTINGS] },
];

const TABS_DEF: { item: NavItem; label: string }[] = [
  { item: OVERVIEW, label: "Overview" },
  { item: MEMBERS, label: "Members" },
  { item: ATTENDANCE, label: "Check-in" },
  { item: PAYMENTS, label: "Payments" },
];

const flatten = (entries: NavEntry[]): NavItem[] =>
  entries.flatMap((e) => (isGroup(e) ? e.children : [e]));

const ALL_ITEMS: NavItem[] = [OVERVIEW, ...SECTIONS_DEF.flatMap((s) => flatten(s.entries)), FEEDBACK, MEMBERSHIP, STAFF, SETTINGS, ENQUIRY];

/**
 * The most specific nav item wins. Without this, /dashboard/diet/recipes lit up
 * both "Diet plans" and "Recipe library" because one href prefixes the other.
 */
function activeHrefFor(pathname: string): string | null {
  let best: NavItem | null = null;
  for (const item of ALL_ITEMS) {
    const hit = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");
    if (hit && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.href ?? null;
}

/** Which group (if any) owns the active route, so its submenu starts open. */
function groupKeyFor(href: string | null): string | null {
  if (!href) return null;
  for (const s of SECTIONS_DEF) {
    for (const e of s.entries) {
      if (isGroup(e) && e.children.some((c) => c.href === href)) return e.key;
    }
  }
  return null;
}

/** Which section owns the active route, so that section starts open. */
function sectionTitleFor(href: string | null): string | null {
  if (!href) return null;
  for (const s of SECTIONS_DEF) {
    for (const e of s.entries) {
      if (isGroup(e)) {
        if (e.children.some((c) => c.href === href)) return s.title;
      } else {
        if (e.href === href) return s.title;
      }
    }
  }
  if (href === MEMBERSHIP.href || href === SETTINGS.href) {
    return "Admin";
  }
  return null;
}

/** Drops links the role can't see. A group left with one link becomes that link; with none, it disappears. */
function visibleEntries(entries: NavEntry[], allowed: (i: NavItem) => boolean): NavEntry[] {
  const out: NavEntry[] = [];
  for (const e of entries) {
    if (!isGroup(e)) { if (allowed(e)) out.push(e); continue; }
    const kids = e.children.filter(allowed);
    if (kids.length === 1) out.push(kids[0]);
    else if (kids.length > 1) out.push({ ...e, children: kids });
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
   Workspace + brand
   ────────────────────────────────────────────────────────────────────────── */

type Workspace = { name: string; branchName: string; email: string; role: string; logo: string | null; orgId: string | null };

function formatRoleName(role?: string | null): string {
  if (!role) return "Owner";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Loads the workspace AND applies the saved theme. The sidebar mounts on every
 * dashboard page, so the brand is live everywhere, not only after visiting Settings.
 */
function useWorkspace() {
  const [ws, setWs] = useState<Workspace | null>(() => {
    const cachedLogo = readCachedOrgLogo();
    return cachedLogo ? { name: "My gym", branchName: "Main Branch", email: "", role: "owner", logo: cachedLogo, orgId: null } : null;
  });

  // Apply the last known theme before paint so navigation never flashes defaults.
  useLayoutEffect(() => {
    const t = getStoredTheme();
    applyTheme(t);
    const cached = readCachedBrand();
    if (cached) applyBrand(cached);
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("org_id, role, staff_role")
        .eq("user_id", user.id)
        .single();

      let name = "My gym";
      let branchName = "Main Branch";
      let logo: string | null = readCachedOrgLogo();
      const orgId = roleData?.org_id ?? null;
      if (roleData) {
        const [{ data: org }, { data: branchData }] = await Promise.all([
          supabase
            .from("organizations")
            .select("name, logo_url, brand, brand_color")
            .eq("id", roleData.org_id)
            .single(),
          supabase
            .from("branches")
            .select("name")
            .eq("org_id", roleData.org_id)
            .order("created_at")
            .limit(1)
            .maybeSingle(),
        ]);
        if (org?.name) name = org.name;
        if (branchData?.name) branchName = branchData.name;
        if (org?.logo_url !== undefined) {
          logo = org.logo_url;
          cacheOrgLogo(org.logo_url);
        }
        if (org && alive) {
          const brand = resolveBrand(org.brand as Partial<Brand> | null, org.brand_color);
          applyBrand(brand);
          cacheBrand(brand);
        }
      }
      if (alive) setWs({
        name,
        branchName,
        logo,
        email: user.email ?? "",
        role: roleData?.staff_role ?? roleData?.role ?? "owner",
        orgId,
      });
    })();

    const onBrand = (e: Event) => {
      const b = (e as CustomEvent<Brand>).detail;
      if (b) { applyBrand(b); cacheBrand(b); }
    };
    const onTheme = () => {
      const cached = readCachedBrand();
      if (cached) applyBrand(cached);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        applyTheme(e.newValue);
      }
    };
    const onOrg = (e: Event) => {
      const d = (e as CustomEvent<OrgUpdate>).detail;
      if (!d) return;
      if (d.logo_url !== undefined) {
        cacheOrgLogo(d.logo_url);
      }
      setWs((w) => w && ({
        ...w,
        name: d.name ?? w.name,
        logo: d.logo_url === undefined ? w.logo : d.logo_url,
      }));
    };
    window.addEventListener(BRAND_SAVED_EVENT, onBrand);
    window.addEventListener(ORG_UPDATED_EVENT, onOrg);
    window.addEventListener(THEME_EVENT, onTheme);
    window.addEventListener("storage", onStorage);

    return () => {
      alive = false;
      window.removeEventListener(BRAND_SAVED_EVENT, onBrand);
      window.removeEventListener(ORG_UPDATED_EVENT, onOrg);
      window.removeEventListener(THEME_EVENT, onTheme);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return ws;
}

/* ──────────────────────────────────────────────────────────────────────────
   Auto-hide behaviour
   Rail (72px) by default. Opens as a flyout on hover or keyboard focus, closes when the
   pointer leaves. "Pinned" keeps it open and tells the page to reserve the full width
   via <html data-sb-pinned>. Hover uses a short intent delay so grazing the left edge on
   the way to something else doesn't pop it open.
   ────────────────────────────────────────────────────────────────────────── */

const PIN_KEY = "psync.sidebar.pinned";
const OPEN_DELAY = 90;   // ms of intent before opening
const CLOSE_DELAY = 180; // ms of grace before closing

function useAutoSidebar() {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const [kbd, setKbd] = useState(false);
  const pinnedRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  // Restore the pin before paint so a pinned user never sees the rail flash.
  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(PIN_KEY) === "1") { pinnedRef.current = true; setPinned(true); }
    } catch { /* storage blocked: stay in auto mode */ }
  }, []);

  // The page reads --sb-w, which this attribute switches between rail and full width.
  useLayoutEffect(() => {
    document.documentElement.dataset.sbPinned = String(pinned);
    return () => { delete document.documentElement.dataset.sbPinned; };
  }, [pinned]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const togglePin = useCallback(() => {
    const next = !pinnedRef.current;
    pinnedRef.current = next;
    setPinned(next);
    try { localStorage.setItem(PIN_KEY, next ? "1" : "0"); } catch { /* ignore */ }
  }, []);

  // "[" toggles the pin. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      togglePin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePin]);

  const schedule = (value: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHover(value), delay);
  };

  const open = pinned || hover || kbd;
  const state: "rail" | "flyout" | "pinned" = pinned ? "pinned" : open ? "flyout" : "rail";

  const handlers = {
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      schedule(true, OPEN_DELAY);
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      schedule(false, CLOSE_DELAY);
    },
    // Only keyboard focus holds the panel open; a mouse click shouldn't.
    onFocus: (e: ReactFocusEvent<HTMLElement>) => {
      if (e.target.matches(":focus-visible")) setKbd(true);
    },
    onBlur: (e: ReactFocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKbd(false);
    },
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key !== "Escape" || pinnedRef.current) return;
      window.clearTimeout(timer.current);
      setHover(false);
      setKbd(false);
      (document.activeElement as HTMLElement | null)?.blur();
    },
    // After choosing a destination, get out of the way of the page.
    onClickCapture: (e: ReactMouseEvent<HTMLElement>) => {
      if (pinnedRef.current) return;
      if ((e.target as HTMLElement).closest("a")) {
        window.clearTimeout(timer.current);
        setHover(false);
        setKbd(false);
      }
    },
  };

  return { pinned, open, state, togglePin, handlers };
}

/* ──────────────────────────────────────────────────────────────────────────
   Pieces
   ────────────────────────────────────────────────────────────────────────── */

/** Gym logo, or an empty circular placeholder when there is no logo (or it fails to load). Shows pencil badge to indicate it is editable. */
function Mark({
  logo,
  onUploadClick,
  size = "md",
}: {
  logo: string | null;
  onUploadClick?: (e: React.MouseEvent) => void;
  size?: "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(logo && !failed);

  return (
    <span
      className={`db-sb-mark-wrap ${size === "lg" ? "db-sb-mark-wrap--lg" : ""}`}
      aria-hidden
      onClick={onUploadClick}
      style={{ cursor: onUploadClick ? "pointer" : "default" }}
    >
      <span
        className={`db-sb-mark ${size === "lg" ? "db-sb-mark--lg" : ""} ${!showImage ? "db-sb-mark--empty" : ""}`}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo!} alt="Gym logo" onError={() => setFailed(true)} />
        ) : (
          <span className="db-sb-mark-text" style={{ fontWeight: 800, color: "var(--accent)" }}>
            G
          </span>
        )}
      </span>
      <span
        className="db-sb-mark-badge"
        title={showImage ? "Change logo" : "Upload logo"}
        role="button"
        tabIndex={0}
        onClick={onUploadClick}
        style={{ cursor: onUploadClick ? "pointer" : undefined }}
      >
        <Pencil size={size === "lg" ? 11 : 10} strokeWidth={2.4} />
      </span>
    </span>
  );
}

function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const ws = useWorkspace();
  const role = useRole();
  const sb = useAutoSidebar();
  const [moreOpen, setMoreOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(getStoredTheme() === "dark");
    const onTheme = (e: Event) => {
      const detail = (e as CustomEvent<"light" | "dark">).detail;
      setIsDark((detail || getStoredTheme()) === "dark");
    };
    window.addEventListener(THEME_EVENT, onTheme);
    return () => window.removeEventListener(THEME_EVENT, onTheme);
  }, []);

  const handleToggleTheme = () => {
    const next = toggleTheme();
    setIsDark(next === "dark");
  };

  const handleMarkUploadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ws?.orgId) return;
    try {
      const r2Url = await uploadToCloudflareR2(file, "logos");
      const urlWithBust = `${r2Url}?t=${Date.now()}`;

      const newBrand = await createBrandFromLogo(file);
      const { ok: savedOk, error: serverErr } = await saveOrgToServer({
        logo_url: urlWithBust,
        brand: newBrand,
        brand_color: newBrand.accent,
      });
      if (!savedOk) throw new Error(serverErr || "Failed to save logo to server");

      cacheOrgLogo(urlWithBust);
      applyBrand(newBrand);
      cacheBrand(newBrand);
      emitBrandSaved(newBrand);
      emitOrgUpdated({ logo_url: urlWithBust });
    } catch (err) {
      console.error("Sidebar logo update failed:", err);
    } finally {
      e.target.value = "";
    }
  };

  const activeHref = activeHrefFor(pathname);
  const activeGroup = groupKeyFor(activeHref);
  const activeSection = sectionTitleFor(activeHref);

  // The submenu holding the current page starts open (computed up front, so it doesn't animate on load).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => (activeGroup ? { [activeGroup]: true } : {}),
  );
  // Navigating into a group from elsewhere (a link on a page, the tab bar) opens it too.
  useEffect(() => {
    if (activeGroup) setOpenGroups((s) => (s[activeGroup] ? s : { ...s, [activeGroup]: true }));
  }, [activeGroup]);
  const toggleGroup = (key: string) => setOpenGroups((s) => ({ ...s, [key]: !s[key] }));

  // Every section starts open by default. User preferences are remembered in localStorage.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("psync.sidebar.sections.v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (activeSection) parsed[activeSection] = true;
        return parsed;
      }
    } catch {}
    return {
      Membership: true,
      Marketing: true,
      Nutrition: true,
      Workouts: true,
      Coaching: true,
      Staff: true,
      Finance: true,
      Notifications: true,
      Admin: true,
    };
  });

  // Always keep section containing active route open
  useEffect(() => {
    if (activeSection) {
      setOpenSections((prev) => (prev[activeSection] ? prev : { ...prev, [activeSection]: true }));
    }
  }, [activeSection]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      try {
        localStorage.setItem("psync.sidebar.sections.v1", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function allowed(item: NavItem): boolean {
    if (role.loading) return true;
    if (!item.permKey) return true;
    return role.permissions[item.permKey as keyof typeof role.permissions] === true;
  }

  const showStaff = !role.loading && (role.staff_role === "owner" || role.staff_role === "manager");
  const showSettings = !role.loading && (role.staff_role === "owner" || role.permissions.settings);
  const showMembership = !role.loading && (role.staff_role === "owner" || role.staff_role === "manager" || role.permissions.settings);

  const sections = SECTIONS_DEF
    .filter((s) => s.title !== "Staff" || showStaff)
    .map((s) => ({ ...s, entries: visibleEntries(s.entries, allowed) }))
    .filter((s) => s.entries.length > 0);

  const tabs = TABS_DEF.filter(({ item }) => allowed(item));

  const accountInitial = (ws?.email ?? "").trim().charAt(0).toUpperCase() || "U";
  const moreActive = !tabs.some(({ item }) => item.href === activeHref);

  /* ---------- desktop rows ---------- */

  const navLink = (item: NavItem, sub = false) => {
    const Icon = item.icon;
    const active = item.href === activeHref;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={sub ? "db-sb-item db-sb-item--sub" : "db-sb-item"}
          aria-current={active ? "page" : undefined}
        >
          {!sub && <Icon size={18} strokeWidth={active ? 2.2 : 1.9} aria-hidden />}
          <span className="db-sb-text db-sb-truncate db-sb-fade">{item.label}</span>
        </Link>
      </li>
    );
  };

  const navEntry = (entry: NavEntry) => {
    if (!isGroup(entry)) return navLink(entry);
    const Icon = entry.icon;
    const open = !!openGroups[entry.key];
    const hasActive = entry.children.some((c) => c.href === activeHref);
    const panelId = `db-sb-sub-${entry.key}`;
    return (
      <li key={entry.key}>
        <button
          type="button"
          className="db-sb-item db-sb-parent"
          aria-expanded={open}
          aria-controls={panelId}
          data-has-active={hasActive}
          onClick={() => toggleGroup(entry.key)}
        >
          <Icon size={18} strokeWidth={hasActive ? 2.2 : 1.9} aria-hidden />
          <span className="db-sb-text db-sb-truncate db-sb-fade">{entry.label}</span>
          <span className="db-sb-caretwrap db-sb-fade"><ChevronDown size={15} className="db-sb-caret" aria-hidden /></span>
        </button>
        <div id={panelId} className="db-sb-sub" data-open={open}>
          <ul className="db-sb-sublist">{entry.children.map((c) => navLink(c, true))}</ul>
        </div>
      </li>
    );
  };

  /* ---------- "More" sheet rows (flat: touch targets beat nesting) ---------- */

  const sheetRow = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <li key={item.href}>
        <Link href={item.href} className="db-sb-row" onClick={() => setMoreOpen(false)}>
          <Icon size={20} className="db-sb-row-icon" aria-hidden />
          <span>{item.label}</span>
          <ChevronRight size={16} className="db-sb-row-chev" aria-hidden />
        </Link>
      </li>
    );
  };

  const PinIcon = sb.pinned ? PanelLeftClose : PanelLeftOpen;

  return (
    <>
      <SidebarStyles />
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={handleLogoFileChange} />

      {/* ---------- Desktop sidebar: rail → flyout / pinned ---------- */}
      <aside
        className="ps-sidebar db-sb"
        aria-label="Main navigation"
        data-state={sb.state}
        data-open={sb.open ? "true" : "false"}
        {...sb.handlers}
      >
        <span className="db-sb-edge" aria-hidden />
        <div className="db-sb-inner">
          <div className="db-sb-head">
            <div className="db-sb-head-top">
              <button
                type="button"
                className="db-sb-iconbtn db-sb-pin-btn db-sb-fade"
                onClick={sb.togglePin}
                aria-pressed={sb.pinned}
                aria-label={sb.pinned ? "Unpin sidebar" : "Pin sidebar open"}
                title={sb.pinned ? "Unpin sidebar ( [ )" : "Pin sidebar open ( [ )"}
              >
                <PinIcon size={18} aria-hidden />
              </button>
            </div>
            <div className="db-sb-logo-wrap">
              <Link href="/dashboard/settings" className="db-sb-brand" aria-label="Gym settings" title={ws?.name ? `${ws.name} - Settings` : "Settings"}>
                <Mark key={ws?.logo ?? "none"} logo={ws?.logo ?? null} onUploadClick={handleMarkUploadClick} size="lg" />
              </Link>
              <div className="db-sb-fade" style={{ marginTop: 8, width: "100%", padding: "0 8px" }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }} title={ws?.name ?? "My gym"}>
                  {ws?.name ?? "My gym"}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1.5 }} title={ws?.branchName ?? "Main Branch"}>
                  {ws?.branchName ?? "Main Branch"}
                </div>
              </div>
            </div>
          </div>

          <nav className="db-sb-nav">
            <div className="db-sb-group">
              <ul className="db-sb-list">{navLink(OVERVIEW)}</ul>
            </div>
            {sections.map((section) => {
              const isOpen = openSections[section.title] ?? true;
              const secId = `db-sb-sec-${section.title.toLowerCase().replace(/\s+/g, "-")}`;
              return (
                <div key={section.title} className="db-sb-group">
                  <button
                    type="button"
                    className="db-sb-label db-sb-label-btn"
                    aria-expanded={isOpen}
                    aria-controls={secId}
                    onClick={() => toggleSection(section.title)}
                  >
                    <span className="db-sb-fade">{section.title}</span>
                    <ChevronDown size={13} className="db-sb-label-caret db-sb-fade" aria-hidden />
                  </button>
                  <div id={secId} className="db-sb-section-body" data-open={isOpen}>
                    <div className="db-sb-section-inner">
                      <ul className="db-sb-list">{section.entries.map(navEntry)}</ul>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="db-sb-group">
              <ul className="db-sb-list">{navLink(FEEDBACK)}</ul>
            </div>
            {(showMembership || showSettings) && (
              (() => {
                const isAdminOpen = openSections["Admin"] ?? true;
                return (
                  <div className="db-sb-group">
                    <button
                      type="button"
                      className="db-sb-label db-sb-label-btn"
                      aria-expanded={isAdminOpen}
                      aria-controls="db-sb-sec-admin"
                      onClick={() => toggleSection("Admin")}
                    >
                      <span className="db-sb-fade">Admin</span>
                      <ChevronDown size={13} className="db-sb-label-caret db-sb-fade" aria-hidden />
                    </button>
                    <div id="db-sb-sec-admin" className="db-sb-section-body" data-open={isAdminOpen}>
                      <div className="db-sb-section-inner">
                        <ul className="db-sb-list">
                          {showMembership && navLink(MEMBERSHIP)}
                          {showSettings && navLink(SETTINGS)}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
            <div className="db-sb-group">
              <ul className="db-sb-list">{navLink(ENQUIRY)}</ul>
            </div>
          </nav>

          <div className="db-sb-foot">
            <div className="db-sb-account">
              <span className="db-sb-avatar" aria-hidden>{(ws?.role ?? "O").trim().charAt(0).toUpperCase()}</span>
              <span className="db-sb-email db-sb-truncate db-sb-fade" title={`Role: ${formatRoleName(ws?.role)}`} style={{ textTransform: "capitalize", fontWeight: 600 }}>
                {formatRoleName(ws?.role)}
              </span>
              <button
                type="button"
                className="db-sb-iconbtn db-sb-fade"
                onClick={handleToggleTheme}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
              </button>
              <button type="button" className="db-sb-iconbtn db-sb-fade" onClick={signOut} aria-label="Sign out" title="Sign out">
                <LogOut size={16} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ---------- Phone / tablet top bar ---------- */}
      <header className="ps-topbar db-sb-top" data-scrolled={scrolled}>
        <Link href="/dashboard" className="db-sb-top-brand">
          <Mark key={ws?.logo ?? "none"} logo={ws?.logo ?? null} onUploadClick={handleMarkUploadClick} />
          <span className="db-sb-top-name db-sb-truncate">{ws?.name ?? "\u00a0"}</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            className="db-sb-iconbtn"
            onClick={handleToggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
          </button>
          {showSettings && (
            <Link href={SETTINGS.href} className="db-sb-iconbtn" aria-label="Settings">
              <Settings size={19} aria-hidden />
            </Link>
          )}
        </div>
      </header>

      {/* ---------- Phone / tablet tab bar ---------- */}
      <nav className="ps-tabbar db-sb-tabs" aria-label="Main navigation">
        {tabs.map(({ item, label }) => {
          const Icon = item.icon;
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="db-sb-tab"
              aria-current={active ? "page" : undefined}
            >
              <Icon size={22} strokeWidth={active ? 2.3 : 1.9} aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className="db-sb-tab"
          aria-current={moreActive ? "page" : undefined}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
        >
          <Menu size={22} strokeWidth={moreActive ? 2.3 : 1.9} aria-hidden />
          <span>More</span>
        </button>
      </nav>

      {/* ---------- More sheet ---------- */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={ws?.name ?? "Menu"} description={formatRoleName(ws?.role)}>
        <div className="db-sb-more">
          {sections.map((section) => {
            const isOpen = openSections[section.title] ?? true;
            return (
              <div key={section.title} style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="db-sb-group-title"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    padding: "6px 0",
                    cursor: "pointer",
                    font: "inherit",
                    color: "inherit",
                    textAlign: "left",
                  }}
                  aria-expanded={isOpen}
                  onClick={() => toggleSection(section.title)}
                >
                  <span>{section.title}</span>
                  <ChevronDown
                    size={14}
                    style={{
                      transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                      transition: "transform 180ms ease",
                      color: "var(--text-tertiary)",
                    }}
                    aria-hidden
                  />
                </button>
                {isOpen && (
                  <ul className="db-sb-group-list">{flatten(section.entries).map(sheetRow)}</ul>
                )}
              </div>
            );
          })}
          <div style={{ marginBottom: 12 }}>
            <ul className="db-sb-group-list">{sheetRow(FEEDBACK)}</ul>
          </div>
          <div>
            {(showMembership || showSettings) && (
              (() => {
                const isAdminOpen = openSections["Admin"] ?? true;
                return (
                  <div style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      className="db-sb-group-title"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        border: "none",
                        background: "transparent",
                        padding: "6px 0",
                        cursor: "pointer",
                        font: "inherit",
                        color: "inherit",
                        textAlign: "left",
                      }}
                      aria-expanded={isAdminOpen}
                      onClick={() => toggleSection("Admin")}
                    >
                      <span>Admin</span>
                      <ChevronDown
                        size={14}
                        style={{
                          transform: isAdminOpen ? "rotate(0deg)" : "rotate(-90deg)",
                          transition: "transform 180ms ease",
                          color: "var(--text-tertiary)",
                        }}
                        aria-hidden
                      />
                    </button>
                    {isAdminOpen && (
                      <ul className="db-sb-group-list">
                        {showMembership && sheetRow(MEMBERSHIP)}
                        {showSettings && sheetRow(SETTINGS)}
                      </ul>
                    )}
                  </div>
                );
              })()
            )}
            <ul className="db-sb-group-list" style={{ marginBottom: 12 }}>
              {sheetRow(ENQUIRY)}
            </ul>
            <ul className="db-sb-group-list">
              <li>
                <button type="button" className="db-sb-row" onClick={handleToggleTheme}>
                  {isDark ? <Sun size={20} className="db-sb-row-icon" aria-hidden /> : <Moon size={20} className="db-sb-row-icon" aria-hidden />}
                  <span>{isDark ? "Light mode" : "Dark mode"}</span>
                </button>
              </li>
              <li>
                <button type="button" className="db-sb-row db-sb-row--danger" onClick={signOut}>
                  <LogOut size={20} aria-hidden />
                  <span>Sign out</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </Sheet>
    </>
  );
}

export function Sidebar() {
  return (
    <Suspense fallback={<aside className="ps-sidebar db-sb" data-state="rail" data-open="false" />}>
      <AppNav />
    </Suspense>
  );
}
