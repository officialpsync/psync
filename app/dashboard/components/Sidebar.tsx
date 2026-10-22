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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Sheet } from "./Sheet";
import { useRole } from "./useRole";
import { SidebarStyles } from "./DesignSystem";
import {
  applyBrand, cacheBrand, readCachedBrand, resolveBrand,
  BRAND_SAVED_EVENT, ORG_UPDATED_EVENT,
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
const LEADS: NavItem     = { href: "/dashboard/leads", label: "Leads", icon: UserPlus, permKey: "leads" };
const ATTENDANCE: NavItem = { href: "/dashboard/attendance", label: "Attendance", icon: UserCheck, permKey: "attendance" };
const CLASSES: NavItem    = { href: "/dashboard/classes", label: "Classes", icon: CalendarDays, permKey: "classes" };
const WORKOUTS: NavItem   = { href: "/dashboard/workouts", label: "Workouts", icon: Dumbbell, permKey: "workouts" };
const EXERCISES: NavItem  = { href: "/dashboard/workouts/exercises", label: "Exercises", icon: Library, permKey: "workouts" };
const DIET: NavItem       = { href: "/dashboard/diet", label: "Diet plans", icon: Salad, permKey: "diet" };
const RECIPES: NavItem    = { href: "/dashboard/diet/recipes", label: "Recipe library", icon: ChefHat, permKey: "recipes" };
const INGREDIENTS: NavItem = { href: "/dashboard/diet/ingredients", label: "Ingredients", icon: Carrot, permKey: "recipes" };
const TEMPLATES: NavItem  = { href: "/dashboard/diet/templates", label: "Diet templates", icon: ClipboardList, permKey: "diet" };
const PAYMENTS: NavItem   = { href: "/dashboard/payments", label: "Payments", icon: Wallet, permKey: "payments" };
const PLANS: NavItem      = { href: "/dashboard/membership-plans", label: "Membership plans", icon: Ticket, permKey: "membership_plans" };
const REPORTS: NavItem    = { href: "/dashboard/reports", label: "Reports", icon: BarChart2, permKey: "reports" };
const SETTINGS: NavItem   = { href: "/dashboard/settings", label: "Settings", icon: Settings, permKey: "settings" };
const STAFF: NavItem      = { href: "/dashboard/staff", label: "Staff", icon: UsersRound };

/** Nutrition and billing each have 2–3 related pages, so they fold into a submenu. */
const NUTRITION: NavGroup = { key: "nutrition", label: "Nutrition", icon: Salad, children: [DIET, RECIPES, INGREDIENTS, TEMPLATES] };
const BILLING: NavGroup   = { key: "billing", label: "Billing", icon: Wallet, children: [PAYMENTS, PLANS] };

const SECTIONS_DEF: { title: string; entries: NavEntry[] }[] = [
  { title: "People",   entries: [MEMBERS, LEADS, ATTENDANCE] },
  { title: "Coaching", entries: [CLASSES, WORKOUTS, EXERCISES, NUTRITION] },
  { title: "Business", entries: [BILLING, REPORTS] },
];

const TABS_DEF: { item: NavItem; label: string }[] = [
  { item: OVERVIEW, label: "Overview" },
  { item: MEMBERS, label: "Members" },
  { item: ATTENDANCE, label: "Check-in" },
  { item: PAYMENTS, label: "Payments" },
];

const flatten = (entries: NavEntry[]): NavItem[] =>
  entries.flatMap((e) => (isGroup(e) ? e.children : [e]));

const ALL_ITEMS: NavItem[] = [OVERVIEW, ...SECTIONS_DEF.flatMap((s) => flatten(s.entries)), STAFF, SETTINGS];

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

function roleLabel(role: string) {
  const s = role.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ──────────────────────────────────────────────────────────────────────────
   Workspace + brand
   ────────────────────────────────────────────────────────────────────────── */

type Workspace = { name: string; email: string; role: string; logo: string | null };

/**
 * Loads the workspace AND applies the saved theme. The sidebar mounts on every
 * dashboard page, so the brand is live everywhere, not only after visiting Settings.
 */
function useWorkspace() {
  const [ws, setWs] = useState<Workspace | null>(null);

  // Apply the last known theme before paint so navigation never flashes defaults.
  useLayoutEffect(() => {
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
      let logo: string | null = null;
      if (roleData) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name, logo_url, brand, brand_color")
          .eq("id", roleData.org_id)
          .single();
        if (org?.name) name = org.name;
        logo = org?.logo_url ?? null;
        if (org && alive) {
          const brand = resolveBrand(org.brand as Partial<Brand> | null, org.brand_color);
          applyBrand(brand);
          cacheBrand(brand);
        }
      }
      if (alive) setWs({
        name,
        logo,
        email: user.email ?? "",
        role: roleData?.staff_role ?? roleData?.role ?? "owner",
      });
    })();

    const onBrand = (e: Event) => {
      const b = (e as CustomEvent<Brand>).detail;
      if (b) { applyBrand(b); cacheBrand(b); }
    };
    const onOrg = (e: Event) => {
      const d = (e as CustomEvent<OrgUpdate>).detail;
      if (!d) return;
      setWs((w) => w && ({
        ...w,
        name: d.name ?? w.name,
        logo: d.logo_url === undefined ? w.logo : d.logo_url,
      }));
    };
    window.addEventListener(BRAND_SAVED_EVENT, onBrand);
    window.addEventListener(ORG_UPDATED_EVENT, onOrg);

    return () => {
      alive = false;
      window.removeEventListener(BRAND_SAVED_EVENT, onBrand);
      window.removeEventListener(ORG_UPDATED_EVENT, onOrg);
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

/** Gym logo, or the gym's initial on the theme chip when there is no logo (or it fails to load). */
function Mark({ logo, initial }: { logo: string | null; initial: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="db-sb-mark" aria-hidden>
      {logo && !failed
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={logo} alt="" onError={() => setFailed(true)} />
        : initial}
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

  const activeHref = activeHrefFor(pathname);
  const activeGroup = groupKeyFor(activeHref);

  // The submenu holding the current page starts open (computed up front, so it doesn't animate on load).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => (activeGroup ? { [activeGroup]: true } : {}),
  );
  // Navigating into a group from elsewhere (a link on a page, the tab bar) opens it too.
  useEffect(() => {
    if (activeGroup) setOpenGroups((s) => (s[activeGroup] ? s : { ...s, [activeGroup]: true }));
  }, [activeGroup]);
  const toggleGroup = (key: string) => setOpenGroups((s) => ({ ...s, [key]: !s[key] }));

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

  const sections = SECTIONS_DEF
    .map((s) => ({ ...s, entries: visibleEntries(s.entries, allowed) }))
    .filter((s) => s.entries.length > 0);

  const showStaff = !role.loading && (role.staff_role === "owner" || role.staff_role === "manager");
  const showSettings = !role.loading && (role.staff_role === "owner" || role.permissions.settings);

  const tabs = TABS_DEF.filter(({ item }) => allowed(item));

  const gymInitial = (ws?.name ?? "G").trim().charAt(0).toUpperCase();
  const accountInitial = (ws?.email ?? "").trim().charAt(0).toUpperCase() || gymInitial;
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

      {/* ---------- Desktop sidebar: rail → flyout / pinned ---------- */}
      <aside
        className="ps-sidebar db-sb"
        aria-label="Main navigation"
        data-state={sb.state}
        data-open={sb.open}
        {...sb.handlers}
      >
        <span className="db-sb-edge" aria-hidden />
        <div className="db-sb-inner">
          <div className="db-sb-head">
            <Link href="/dashboard/settings" className="db-sb-brand" aria-label="Gym settings">
              <Mark key={ws?.logo ?? "none"} logo={ws?.logo ?? null} initial={gymInitial} />
              <span className="db-sb-id db-sb-fade">
                {ws ? (
                  <>
                    <span className="db-sb-name db-sb-truncate">{ws.name}</span>
                    <span className="db-sb-role db-sb-truncate">{roleLabel(ws.role)}</span>
                  </>
                ) : (
                  <>
                    <span className="db-sb-skel" style={{ width: "70%" }} />
                    <span className="db-sb-skel" style={{ width: "38%", height: 10, marginTop: 6 }} />
                  </>
                )}
              </span>
            </Link>
            <button
              type="button"
              className="db-sb-iconbtn db-sb-fade"
              onClick={sb.togglePin}
              aria-pressed={sb.pinned}
              aria-label={sb.pinned ? "Unpin sidebar" : "Pin sidebar open"}
              title={sb.pinned ? "Unpin sidebar ( [ )" : "Pin sidebar open ( [ )"}
            >
              <PinIcon size={17} aria-hidden />
            </button>
          </div>

          <nav className="db-sb-nav">
            <div className="db-sb-group">
              <ul className="db-sb-list">{navLink(OVERVIEW)}</ul>
            </div>
            {sections.map((section) => (
              <div key={section.title} className="db-sb-group">
                <div className="db-sb-label"><span className="db-sb-fade">{section.title}</span></div>
                <ul className="db-sb-list">{section.entries.map(navEntry)}</ul>
              </div>
            ))}
            {(showStaff || showSettings) && (
              <div className="db-sb-group">
                <div className="db-sb-label"><span className="db-sb-fade">Admin</span></div>
                <ul className="db-sb-list">
                  {showStaff && navLink(STAFF)}
                  {showSettings && navLink(SETTINGS)}
                </ul>
              </div>
            )}
          </nav>

          <div className="db-sb-foot">
            <div className="db-sb-account">
              <span className="db-sb-avatar" aria-hidden>{accountInitial}</span>
              <span className="db-sb-email db-sb-truncate db-sb-fade" title={ws?.email}>{ws?.email}</span>
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
          <Mark key={ws?.logo ?? "none"} logo={ws?.logo ?? null} initial={gymInitial} />
          <span className="db-sb-top-name db-sb-truncate">{ws?.name ?? "\u00a0"}</span>
        </Link>
        {showSettings && (
          <Link href={SETTINGS.href} className="db-sb-iconbtn" aria-label="Settings">
            <Settings size={19} aria-hidden />
          </Link>
        )}
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
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={ws?.name ?? "Menu"} description={ws?.email}>
        <div className="db-sb-more">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="db-sb-group-title">{section.title}</div>
              <ul className="db-sb-group-list">{flatten(section.entries).map(sheetRow)}</ul>
            </div>
          ))}
          <div>
            <ul className="db-sb-group-list">
              {showStaff && sheetRow(STAFF)}
              {showSettings && sheetRow(SETTINGS)}
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
