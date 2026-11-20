"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dumbbell,
  Check,
  Timer,
  Play,
  Pause,
  RotateCcw,
  X,
  Volume2,
  Sparkles,
  Info,
} from "lucide-react";
import type { PortalMember, PortalWorkoutProgram, PortalWorkoutDay, PortalWorkoutItem } from "../types";
import { getCompletedSets, toggleCompletedSet } from "../lib/portalState";

interface WorkoutTabProps {
  member: PortalMember;
  workout: PortalWorkoutProgram | null;
}

export function WorkoutTab({ member, workout }: WorkoutTabProps) {
  const prog = workout?.workout_programs;
  const days = prog?.days ?? [];
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [completedSets, setCompletedSets] = useState<Set<string>>(new Set());

  // Rest Timer State
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load completed sets on mount
  useEffect(() => {
    setCompletedSets(getCompletedSets(member.id));
  }, [member.id]);

  // Rest timer countdown
  useEffect(() => {
    if (timerRunning && timerSecondsLeft > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSecondsLeft((s) => {
          if (s <= 1) {
            playTimerSound();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerRunning, timerSecondsLeft]);

  function playTimerSound() {
    try {
      if (typeof window !== "undefined" && "navigator" in window && "vibrate" in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      // Simple web audio beep
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {
      // Audio playback restrictions fallback
    }
  }

  function handleStartTimer(seconds: number = 60) {
    setTimerSecondsLeft(seconds);
    setTimerRunning(true);
    setTimerOpen(true);
  }

  function handleToggleSet(item: PortalWorkoutItem, setIndex: number) {
    const key = `${item.id}_set_${setIndex}`;
    const next = toggleCompletedSet(member.id, key);
    setCompletedSets(new Set(next));

    // If checking a set off as done, automatically pop up the rest timer!
    if (next.has(key) && (item.rest_sec || 60) > 0) {
      handleStartTimer(item.rest_sec || 60);
    }
  }

  if (!workout || !prog) {
    return (
      <div className="portal-card" style={{ padding: "40px 20px", textAlign: "center", alignItems: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: "var(--accent-dim)",
            color: "var(--accent)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Dumbbell size={28} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12 }}>No Workout Routine Assigned</div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 280, marginTop: 4 }}>
          Your trainer hasn&apos;t assigned an active workout plan yet. Speak to your gym trainer to assign a custom split.
        </p>
      </div>
    );
  }

  const currentDay: PortalWorkoutDay | undefined = days[selectedDayIndex] || days[0];
  const items = currentDay?.items ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── PROGRAM HEADER ── */}
      <div className="portal-card" style={{ gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.05em" }}>
              Active Program
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{prog.name}</h1>
          </div>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--fill)",
              fontSize: 11.5,
              fontWeight: 650,
              textTransform: "capitalize",
            }}
          >
            {prog.difficulty}
          </span>
        </div>

        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-secondary)" }}>
          <span>{prog.days_per_week} days/week</span>
          <span>•</span>
          <span style={{ textTransform: "capitalize" }}>{prog.goal.replace(/_/g, " ")}</span>
          {prog.duration_weeks && (
            <>
              <span>•</span>
              <span>{prog.duration_weeks} weeks</span>
            </>
          )}
        </div>
      </div>

      {/* ── DAY SELECTOR PILLS ── */}
      {days.length > 0 && (
        <div className="portal-pills">
          {days.map((d, idx) => {
            const isSelected = idx === selectedDayIndex;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDayIndex(idx)}
                className={`portal-pill ${isSelected ? "active" : ""}`}
              >
                {d.day_name || `Day ${d.day_number}`}
              </button>
            );
          })}
        </div>
      )}

      {/* ── DAY FOCUS SUMMARY ── */}
      {currentDay && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {currentDay.day_name}
            {currentDay.focus && (
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginLeft: 6 }}>
                ({currentDay.focus})
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {items.length} exercise{items.length === 1 ? "" : "s"}
          </div>
        </div>
      )}

      {/* ── EXERCISE LIST ── */}
      {items.length === 0 ? (
        <div className="portal-card" style={{ padding: "30px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No exercises added to this day.</div>
        </div>
      ) : (
        items.map((item, exIndex) => {
          const ex = item.exercise;
          const totalSets = item.sets || 3;
          const setNums = Array.from({ length: totalSets }, (_, i) => i + 1);

          return (
            <div key={item.id} className="portal-ex-card">
              <div className="portal-ex-top">
                <div className="portal-ex-thumb">
                  {ex?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ex.image_url} alt={ex.name} />
                  ) : (
                    <Dumbbell size={24} style={{ color: "var(--text-tertiary)" }} />
                  )}
                </div>

                <div className="portal-ex-info">
                  <div className="portal-ex-name">{ex?.name || `Exercise ${exIndex + 1}`}</div>
                  <div className="portal-ex-tags">
                    {ex?.muscle_group && <span className="portal-ex-tag">{ex.muscle_group}</span>}
                    {ex?.equipment && <span className="portal-ex-tag">{ex.equipment}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
                    Target: <b>{item.sets} sets</b> × <b>{item.reps || "10-12"} reps</b>
                    {item.weight_kg ? ` @ ${item.weight_kg}kg` : ""}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleStartTimer(item.rest_sec || 60)}
                  title="Start Rest Timer"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "6px 8px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    fontSize: 10.5,
                    fontWeight: 650,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    height: "fit-content",
                  }}
                >
                  <Timer size={14} style={{ color: "var(--accent)" }} />
                  <span>{item.rest_sec || 60}s</span>
                </button>
              </div>

              {/* Checkable Sets Table */}
              <div className="portal-sets-table">
                {setNums.map((setNum) => {
                  const setKey = `${item.id}_set_${setNum}`;
                  const isDone = completedSets.has(setKey);

                  return (
                    <div
                      key={setNum}
                      className={`portal-set-row ${isDone ? "done" : ""}`}
                      onClick={() => handleToggleSet(item, setNum)}
                      style={{ cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 650, width: 44 }}>Set {setNum}</span>
                        <span style={{ color: isDone ? "var(--green)" : "var(--text-secondary)", fontSize: 12 }}>
                          {item.reps || "10"} reps {item.weight_kg ? `• ${item.weight_kg} kg` : ""}
                        </span>
                      </div>

                      <div className="portal-set-check" aria-checked={isDone} role="checkbox">
                        {isDone && <Check size={14} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* ── FLOATING REST TIMER OVERLAY ── */}
      {timerOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            width: "calc(100% - 32px)",
            maxWidth: 400,
          }}
        >
          <div
            className="portal-rest-timer"
            style={{
              justifyContent: "space-between",
              width: "100%",
              padding: "10px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Timer size={18} style={{ color: timerRunning ? "#5fe382" : "#ffb340" }} />
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>Rest Interval</div>
                <div style={{ fontSize: 18, fontVariantNumeric: "tabular-nums", fontWeight: 750 }}>
                  {formatSeconds(timerSecondsLeft)}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => setTimerSecondsLeft((s) => s + 30)}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "none",
                  color: "#fff",
                  padding: "4px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                +30s
              </button>

              <button
                type="button"
                onClick={() => setTimerRunning((r) => !r)}
                style={{
                  background: timerRunning ? "#ff9f0a" : "#34c759",
                  border: "none",
                  color: "#fff",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                }}
              >
                {timerRunning ? <Pause size={14} fill="#fff" /> : <Play size={14} fill="#fff" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setTimerRunning(false);
                  setTimerOpen(false);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.6)",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
