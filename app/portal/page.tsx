"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import "./portal.css";
import {
  fetchMemberById,
  getCachedMemberId,
  setCachedMemberId,
  clearCachedMemberId,
  fetchPortalBundle,
} from "./lib/portalState";
import type {
  PortalMember,
  PortalMembership,
  PortalAttendanceLog,
  PortalPayment,
  PortalWorkoutProgram,
  PortalDietPlan,
  PortalTab,
  GymOccupancy,
} from "./types";
import { supabase } from "@/lib/supabase";
import { PortalHeader } from "./components/PortalHeader";
import { PortalBottomNav } from "./components/PortalBottomNav";
import { QRCodeModal } from "./components/QRCodeModal";
import { PortalGate } from "./components/PortalGate";
import { HomeTab } from "./components/HomeTab";
import { WorkoutTab } from "./components/WorkoutTab";
import { DietTab } from "./components/DietTab";
import { ClassesTab } from "./components/ClassesTab";
import { ProfileTab } from "./components/ProfileTab";
import { Loader2 } from "lucide-react";

export default function PortalPage() {
  return (
    <Suspense
      fallback={
        <div className="portal-root" style={{ alignItems: "center", justifyContent: "center" }}>
          <Loader2 size={32} className="ps-spin" style={{ color: "var(--accent)" }} />
        </div>
      }
    >
      <PortalApp />
    </Suspense>
  );
}

function PortalApp() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [member, setMember] = useState<PortalMember | null>(null);
  const [membership, setMembership] = useState<PortalMembership | null>(null);
  const [attendance, setAttendance] = useState<PortalAttendanceLog[]>([]);
  const [payments, setPayments] = useState<PortalPayment[]>([]);
  const [workout, setWorkout] = useState<PortalWorkoutProgram | null>(null);
  const [diet, setDiet] = useState<PortalDietPlan | null>(null);
  const [gymOccupancy, setGymOccupancy] = useState<GymOccupancy | null>(null);

  const [activeTab, setActiveTab] = useState<PortalTab>("pass");
  const [loading, setLoading] = useState(true);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // Load all member-related data
  const loadMemberData = useCallback(async (m: PortalMember) => {
    try {
      const bundle = await fetchPortalBundle(m.id);
      if (bundle) {
        setMembership(bundle.membership || null);
        setAttendance(bundle.attendance || []);
        setPayments(bundle.payments || []);
        setDiet(bundle.diet || null);
        setWorkout(bundle.workout || null);
        if (bundle.gymOccupancy) setGymOccupancy(bundle.gymOccupancy);
        return;
      }

      const [
        { data: msData },
        { data: attData },
        { data: payData },
        { data: dietData },
        { data: mwData },
      ] = await Promise.all([
        supabase
          .from("memberships")
          .select("*, membership_plans(name, duration_days, price_paise)")
          .eq("member_id", m.id)
          .eq("status", "active")
          .order("start_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("attendance_logs")
          .select("*")
          .eq("member_id", m.id)
          .order("check_in_at", { ascending: false })
          .limit(50),
        supabase
          .from("payments")
          .select("*")
          .eq("member_id", m.id)
          .order("paid_at", { ascending: false })
          .limit(30),
        supabase
          .from("member_diet_plans")
          .select("*")
          .eq("member_id", m.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("member_workout_programs")
          .select("*, workout_programs(*)")
          .eq("member_id", m.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setMembership((msData as unknown as PortalMembership) || null);
      setAttendance((attData as PortalAttendanceLog[]) || []);
      setPayments((payData as unknown as PortalPayment[]) || []);
      setDiet((dietData as unknown as PortalDietPlan) || null);

      // If active workout program exists, fetch its days and exercise items
      if (mwData && mwData.workout_programs) {
        const progId = mwData.workout_programs.id;
        const { data: days } = await supabase
          .from("workout_program_days")
          .select("*")
          .eq("program_id", progId)
          .order("day_number");

        const dayIds = (days ?? []).map((d) => d.id);
        const { data: items } = dayIds.length
          ? await supabase
              .from("workout_program_items")
              .select("*, exercise:workout_exercises(*)")
              .in("day_id", dayIds)
              .order("sort_order")
          : { data: [] };

        const fullDays = (days ?? []).map((d) => ({
          ...d,
          items: (items ?? []).filter((it) => it.day_id === d.id),
        }));

        setWorkout({
          ...mwData,
          workout_programs: {
            ...mwData.workout_programs,
            days: fullDays,
          },
        });
      } else {
        setWorkout(null);
      }
    } catch (err) {
      console.error("Error loading member data:", err);
    }
  }, []);

  // Initialization: check ?m= URL query param OR cached localStorage
  useEffect(() => {
    async function init() {
      setLoading(true);
      const urlMemberId = searchParams.get("m");
      const urlTab = searchParams.get("tab") as PortalTab | null;
      if (urlTab && ["pass", "workout", "diet", "classes", "profile"].includes(urlTab)) {
        setActiveTab(urlTab);
      }

      let activeMemberId = urlMemberId;

      // Option B — One-Tap WhatsApp link: ?m=<member_id>
      if (urlMemberId) {
        setCachedMemberId(urlMemberId);
      } else {
        activeMemberId = getCachedMemberId();
      }

      if (activeMemberId) {
        const m = await fetchMemberById(activeMemberId);
        if (m) {
          setMember(m);
          setCachedMemberId(m.id);
          await loadMemberData(m);
        } else {
          clearCachedMemberId();
        }
      }
      setLoading(false);
    }

    init();
  }, [searchParams, loadMemberData]);

  function handleMemberLoaded(m: PortalMember) {
    setMember(m);
    setLoading(true);
    loadMemberData(m).finally(() => setLoading(false));
  }

  function handleLogout() {
    clearCachedMemberId();
    setMember(null);
    setMembership(null);
    setAttendance([]);
    setPayments([]);
    setWorkout(null);
    setDiet(null);
    // Remove query param from URL
    router.replace("/portal");
  }

  if (loading) {
    return (
      <div className="portal-root" style={{ alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} className="ps-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  if (!member) {
    return <PortalGate onMemberLoaded={handleMemberLoaded} />;
  }

  return (
    <div className="portal-root">
      <div className="portal-container">
        {/* Top Header */}
        <PortalHeader
          member={member}
          gymOccupancy={gymOccupancy}
          onOpenQR={() => setQrModalOpen(true)}
          onLogout={handleLogout}
        />

        {/* Scrollable Tab Content */}
        <main className="portal-content">
          {activeTab === "pass" && (
            <HomeTab
              member={member}
              membership={membership}
              attendance={attendance}
              workout={workout}
              diet={diet}
              gymOccupancy={gymOccupancy}
              onOpenQR={() => setQrModalOpen(true)}
              onSwitchTab={setActiveTab}
            />
          )}

          {activeTab === "workout" && (
            <WorkoutTab member={member} workout={workout} />
          )}

          {activeTab === "diet" && (
            <DietTab member={member} diet={diet} />
          )}

          {activeTab === "classes" && (
            <ClassesTab member={member} />
          )}

          {activeTab === "profile" && (
            <ProfileTab
              member={member}
              membership={membership}
              attendance={attendance}
              payments={payments}
              onLogout={handleLogout}
            />
          )}
        </main>

        {/* Floating Bottom Nav */}
        <PortalBottomNav
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          hasWorkout={Boolean(workout)}
          hasDiet={Boolean(diet)}
        />

        {/* Fullscreen High-Contrast QR Code Pass */}
        {qrModalOpen && (
          <QRCodeModal
            memberId={member.id}
            memberName={member.full_name}
            branchName={member.branches?.name}
            onClose={() => setQrModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
