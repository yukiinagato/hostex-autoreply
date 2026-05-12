"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { HostexReservation } from "@/lib/hostex/reservations";

// ----- date utils -----

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function nightsBetween(checkIn: string, checkOut: string): number {
  const a = parseYmd(checkIn).getTime();
  const b = parseYmd(checkOut).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ----- types -----

type ResExt = HostexReservation & {
  reservation_code?: string;
  guest_name?: string;
  remarks?: string | null;
  check_in_details?: {
    arrival_at?: { hour?: number; minute?: number } | null;
    departure_at?: { hour?: number; minute?: number } | null;
  };
};

function getGuestName(r: ResExt): string {
  return (
    r.guest_name ||
    (r.guest as { name?: string } | undefined)?.name ||
    "客人"
  );
}
function fmtHm(t: { hour?: number; minute?: number } | null | undefined): string {
  if (!t || t.hour == null) return "";
  return `${String(t.hour).padStart(2, "0")}:${String(t.minute ?? 0).padStart(2, "0")}`;
}

// Pre-processed reservation for the calendar layer.
type PrepRes = {
  code: string;
  start: Date;       // first night
  endNight: Date;    // last night (= check_out_date - 1 day)
  isCurrent: boolean;
  hasRemark: boolean;
  nights: number;
  r: ResExt;
};

function prepareReservations(list: HostexReservation[], currentCode?: string | null): PrepRes[] {
  const out: PrepRes[] = [];
  for (const raw of list) {
    const r = raw as ResExt;
    const code = String(r.reservation_code ?? r.id ?? "");
    const status = (r.status ?? "").toString();
    if (status === "cancelled" || status === "denied" || status === "timeout") continue;
    if (!r.check_in_date || !r.check_out_date) continue;
    const start = parseYmd(r.check_in_date);
    const out2 = parseYmd(r.check_out_date);
    const endNight = new Date(out2);
    endNight.setDate(endNight.getDate() - 1);
    out.push({
      code,
      start,
      endNight,
      isCurrent: !!currentCode && code === currentCode,
      hasRemark: !!(r.remarks && r.remarks.trim()),
      nights: nightsBetween(r.check_in_date, r.check_out_date),
      r,
    });
  }
  return out;
}

// One week = 7 days starting Monday, plus the segments that touch this week.
type WeekRow = {
  days: Array<{ date: Date; inMonth: boolean }>;
  weekStart: Date; // Monday
  segments: Array<{
    res: PrepRes;
    startCol: number;     // 0-6 within week
    span: number;         // number of columns
    isFirstSegment: boolean; // segment contains the booking's check-in day
    isLastSegment: boolean;  // segment contains the booking's last night
  }>;
};

function buildWeeks(month: Date, prepped: PrepRes[]): WeekRow[] {
  const first = startOfMonth(month);
  const firstWeekday = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - firstWeekday);

  const weeks: WeekRow[] = [];
  for (let w = 0; w < 6; w++) {
    const weekStart = new Date(gridStart);
    weekStart.setDate(gridStart.getDate() + w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const days: WeekRow["days"] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push({ date: d, inMonth: d.getMonth() === month.getMonth() });
    }

    const segments: WeekRow["segments"] = [];
    for (const p of prepped) {
      // Skip if booking doesn't overlap this week
      if (p.endNight < weekStart || p.start > weekEnd) continue;
      const segStart = p.start < weekStart ? weekStart : p.start;
      const segEnd = p.endNight > weekEnd ? weekEnd : p.endNight;
      const startCol = Math.round((segStart.getTime() - weekStart.getTime()) / 86_400_000);
      const endCol = Math.round((segEnd.getTime() - weekStart.getTime()) / 86_400_000);
      const span = endCol - startCol + 1;
      segments.push({
        res: p,
        startCol,
        span,
        isFirstSegment: sameDay(segStart, p.start),
        isLastSegment: sameDay(segEnd, p.endNight),
      });
    }
    weeks.push({ days, weekStart, segments });
  }
  return weeks;
}

// ----- MonthGrid -----

const WEEKDAYS_ZH = ["一", "二", "三", "四", "五", "六", "日"];

export function MonthGrid({
  month,
  reservations,
  currentReservationCode,
  compact = false,
  onSelect,
}: {
  month: Date;
  reservations: HostexReservation[];
  currentReservationCode?: string | null;
  compact?: boolean;
  onSelect?: (r: ResExt) => void;
}) {
  const prepped = useMemo(
    () => prepareReservations(reservations, currentReservationCode),
    [reservations, currentReservationCode],
  );
  const weeks = useMemo(() => buildWeeks(month, prepped), [month, prepped]);

  const minRowH = compact ? 56 : 72;
  const bandH = compact ? 22 : 26;
  const dayFs = compact ? 11 : 12;
  const labelFs = compact ? 11 : 12;

  return (
    <div>
      <div className="grid grid-cols-7 gap-px text-[10px] text-neutral-500 mb-1">
        {WEEKDAYS_ZH.map((w) => (
          <div key={w} className="text-center py-0.5">{w}</div>
        ))}
      </div>
      <div className="bg-neutral-200/60 dark:bg-neutral-800/60 rounded overflow-hidden">
        {weeks.map((week, wi) => (
          <div
            key={wi}
            className="relative grid grid-cols-7 gap-px"
            style={{ minHeight: minRowH, marginBottom: wi < 5 ? 1 : 0 }}
          >
            {/* Day cells (background + day numbers) */}
            {week.days.map((d, ci) => (
              <div
                key={ci}
                className={`bg-white dark:bg-neutral-900 ${d.inMonth ? "" : "opacity-40"}`}
              >
                <div
                  className="px-1 pt-0.5 text-neutral-700 dark:text-neutral-300 leading-none select-none"
                  style={{ fontSize: dayFs }}
                >
                  {d.date.getDate()}
                </div>
              </div>
            ))}

            {/* Band overlay — the same 7-column grid, but bands span via gridColumn.
                Force a single auto-placed row at fixed height so every segment gets
                the same vertical box regardless of column span or content length. */}
            <div
              className="absolute left-0 right-0 grid grid-cols-7 gap-px pointer-events-none"
              style={{ bottom: 4, height: bandH, gridAutoRows: `${bandH}px` }}
            >
              {week.segments.map((s, si) => {
                const p = s.res;
                const guest = getGuestName(p.r);
                const bg = p.isCurrent
                  ? "bg-blue-500 hover:bg-blue-600"
                  : "bg-slate-400 hover:bg-slate-500 dark:bg-slate-600 dark:hover:bg-slate-500";
                const shape =
                  s.isFirstSegment && s.isLastSegment ? "rounded mx-1" :
                  s.isFirstSegment ? "rounded-l ml-1" :
                  s.isLastSegment ? "rounded-r mr-1" : "";
                const tooltip = `${guest} · ${p.r.check_in_date} → ${p.r.check_out_date}（${p.nights} 晚）${p.hasRemark ? " · 有备注" : ""}`;
                return (
                  <button
                    key={si}
                    type="button"
                    title={tooltip}
                    onClick={() => onSelect?.(p.r)}
                    className={`${bg} ${shape} pointer-events-auto text-white transition-colors flex items-center px-1.5 min-w-0 box-border`}
                    style={{
                      gridColumn: `${s.startCol + 1} / span ${s.span}`,
                      gridRow: 1,
                      height: bandH,
                      fontSize: labelFs,
                    }}
                  >
                    <span className="flex items-center gap-1 min-w-0 w-full leading-none">
                      <span className="truncate flex-1 text-left">{guest}</span>
                      <span className="opacity-90 shrink-0 tabular-nums">{p.nights}晚</span>
                      {p.hasRemark && <span className="shrink-0" aria-label="有备注">📝</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----- Booking detail popup -----

function BookingDetailModal({ r, onClose }: { r: ResExt; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ci = r.check_in_details ?? {};
  const arrival = fmtHm(ci.arrival_at);
  const departure = fmtHm(ci.departure_at);
  const nights = r.check_in_date && r.check_out_date ? nightsBetween(r.check_in_date, r.check_out_date) : 0;
  const channel = (r as { custom_channel?: { name?: string } }).custom_channel?.name ?? r.channel_type;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-3">
          <h3 className="font-semibold text-sm truncate">{getGuestName(r)}</h3>
          <span className="text-[11px] text-neutral-500">#{r.reservation_code ?? r.id}</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 text-lg leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </header>
        <div className="p-4 space-y-3 text-xs">
          <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1.5">
            {channel && (<><dt className="text-neutral-500">渠道</dt><dd>{channel}</dd></>)}
            {r.status && (<><dt className="text-neutral-500">状态</dt><dd>{r.status}</dd></>)}
            <dt className="text-neutral-500">入住日期</dt>
            <dd>
              {r.check_in_date}
              {arrival && <span className="text-neutral-500"> · 预计 {arrival}</span>}
            </dd>
            <dt className="text-neutral-500">退房日期</dt>
            <dd>
              {r.check_out_date}
              {departure && <span className="text-neutral-500"> · {departure}</span>}
            </dd>
            <dt className="text-neutral-500">夜数</dt>
            <dd className="font-medium">{nights} 晚</dd>
            {r.number_of_guests != null && (
              <>
                <dt className="text-neutral-500">人数</dt>
                <dd>{r.number_of_guests} 人</dd>
              </>
            )}
          </dl>

          {r.remarks?.trim() && (
            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                <span>📝</span><span>房东备注</span>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {r.remarks}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----- CalendarSection (collapsible card) -----

export function CalendarSection({
  propertyId,
  anchorDate,
  currentReservationCode,
}: {
  propertyId: string;
  anchorDate: string;
  currentReservationCode?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [selected, setSelected] = useState<ResExt | null>(null);

  // Stable string keys for the anchor month so children memoize correctly and
  // don't refetch on every parent re-render.
  const anchorMonthYmd = useMemo(
    () => ymd(startOfMonth(parseYmd(anchorDate))),
    [anchorDate],
  );

  return (
    <>
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between text-sm hover:underline"
        >
          <span className="font-medium">📅 房源预订日历</span>
          <span className="text-xs text-neutral-500">{open ? "收起 ▲" : "展开 ▼"}</span>
        </button>
        {open && (
          <div className="mt-2 space-y-2">
            <SingleMonth
              propertyId={propertyId}
              monthYmd={anchorMonthYmd}
              currentReservationCode={currentReservationCode}
              onSelect={setSelected}
            />
            <button
              type="button"
              onClick={() => setShowFull(true)}
              className="w-full text-xs rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 py-1.5"
            >
              查看其他月份
            </button>
            <Legend />
          </div>
        )}
      </div>
      {showFull && (
        <CalendarFullScreen
          propertyId={propertyId}
          anchorMonthYmd={anchorMonthYmd}
          currentReservationCode={currentReservationCode}
          onClose={() => setShowFull(false)}
          onSelect={setSelected}
        />
      )}
      {selected && <BookingDetailModal r={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-neutral-500">
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-2 rounded-sm bg-blue-500" />当前订单
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-2 rounded-sm bg-slate-400 dark:bg-slate-600" />其他订单
      </span>
      <span>📝 备注</span>
    </div>
  );
}

function SingleMonth({
  propertyId,
  monthYmd,
  currentReservationCode,
  onSelect,
}: {
  propertyId: string;
  monthYmd: string; // YYYY-MM-01
  currentReservationCode?: string | null;
  onSelect: (r: ResExt) => void;
}) {
  const month = useMemo(() => parseYmd(monthYmd), [monthYmd]);
  const [reservations, setReservations] = useState<HostexReservation[]>([]);
  // Track whether we have data yet — first load shows skeleton, subsequent
  // refetches from cache update silently.
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const start = ymd(addMonths(month, -1));
    const end = ymd(addMonths(month, 2));
    setError(null);
    fetch(
      `/api/calendar?property_id=${encodeURIComponent(propertyId)}&start=${start}&end=${end}`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (cancelled) return;
        setReservations(j.reservations as HostexReservation[]);
        setLoaded(true);
      })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [propertyId, monthYmd, month]);

  return (
    <div>
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        {month.getFullYear()} 年 {month.getMonth() + 1} 月
      </div>
      {!loaded && !error ? (
        <div className="text-[11px] text-neutral-500 py-4 text-center">加载中…</div>
      ) : error ? (
        <div className="text-[11px] text-red-600 py-2">{error}</div>
      ) : (
        <MonthGrid
          month={month}
          reservations={reservations}
          currentReservationCode={currentReservationCode}
          compact
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

// ----- Fullscreen calendar -----

function CalendarFullScreen({
  propertyId,
  anchorMonthYmd,
  currentReservationCode,
  onClose,
  onSelect,
}: {
  propertyId: string;
  anchorMonthYmd: string;
  currentReservationCode?: string | null;
  onClose: () => void;
  onSelect: (r: ResExt) => void;
}) {
  const anchorMonth = useMemo(() => parseYmd(anchorMonthYmd), [anchorMonthYmd]);
  const months = useMemo(() => {
    const out: Date[] = [];
    for (let i = -4; i <= 8; i++) out.push(addMonths(anchorMonth, i));
    return out;
  }, [anchorMonth]);

  const [reservations, setReservations] = useState<HostexReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const start = ymd(months[0]);
    const end = ymd(addMonths(months[months.length - 1], 1));
    setLoading(true);
    fetch(
      `/api/calendar?property_id=${encodeURIComponent(propertyId)}&start=${start}&end=${end}`,
      { cache: "no-store" },
    )
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j) => { if (!cancelled) setReservations(j.reservations as HostexReservation[]); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propertyId, months]);

  useEffect(() => {
    if (!loading) anchorRef.current?.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior });
  }, [loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-stretch justify-center p-2 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-3xl flex flex-col max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-3 shrink-0">
          <h3 className="text-sm font-semibold">房源预订日历</h3>
          <Legend />
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 text-lg leading-none"
          >
            ×
          </button>
        </header>
        {error && <div className="px-4 py-2 text-xs text-red-600">{error}</div>}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="text-xs text-neutral-500 py-12 text-center">加载中…</div>
          ) : (
            months.map((m, i) => {
              const isAnchor =
                m.getFullYear() === anchorMonth.getFullYear() && m.getMonth() === anchorMonth.getMonth();
              return (
                <div key={i} ref={isAnchor ? anchorRef : null}>
                  <div className={`text-sm font-medium mb-2 ${isAnchor ? "text-blue-600" : ""}`}>
                    {m.getFullYear()} 年 {m.getMonth() + 1} 月
                    {isAnchor && <span className="ml-2 text-[10px] uppercase tracking-wide">本月</span>}
                  </div>
                  <MonthGrid
                    month={m}
                    reservations={reservations}
                    currentReservationCode={currentReservationCode}
                    onSelect={onSelect}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
