'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/Modal';
import { PlusIcon } from '@/components/Icons';
import { api, downloadInterviewAttachment } from '@/lib/api';
import { classNames } from '@/lib/format';
import type { CalendarMeeting, Job } from '@/lib/types';

type View = 'day' | 'week' | 'month';

interface PlacedMeeting {
  meeting: CalendarMeeting;
  start: Date;
  end: Date;
  allDay: boolean;
}

const START_HOUR = 0;
const END_HOUR = 24;
const HOUR_PX = 48;
const COLORS = [
  { bg: '#e8f0fe', border: '#1a73e8', text: '#174ea6' },
  { bg: '#e6f4ea', border: '#188038', text: '#0d652d' },
  { bg: '#fef7e0', border: '#f9ab00', text: '#7a4f01' },
  { bg: '#fce8e6', border: '#d93025', text: '#a50e0e' },
  { bg: '#f3e8fd', border: '#9334e6', text: '#681da8' },
  { bg: '#e0f7fa', border: '#0097a7', text: '#006064' },
];

function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash + char.charCodeAt(0)) % COLORS.length;
  return COLORS[hash];
}

function interviewStepLabel(step: number) {
  const mod100 = step % 100;
  let suffix = 'th';
  if (mod100 < 11 || mod100 > 13) {
    if (step % 10 === 1) suffix = 'st';
    else if (step % 10 === 2) suffix = 'nd';
    else if (step % 10 === 3) suffix = 'rd';
  }
  return `${step}${suffix} interview`;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfWeek(date: Date) {
  return addDays(startOfDay(date), -date.getDay());
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function placeMeeting(meeting: CalendarMeeting): PlacedMeeting | null {
  const interview = meeting.interview;
  if (interview.startsAt) {
    const start = new Date(interview.startsAt);
    if (Number.isNaN(start.getTime())) return null;
    const end = interview.endsAt ? new Date(interview.endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
    return { meeting, start, end: Number.isNaN(end.getTime()) ? new Date(start.getTime() + 60 * 60 * 1000) : end, allDay: false };
  }
  if (interview.date) {
    const start = new Date(interview.date);
    if (Number.isNaN(start.getTime())) return null;
    return { meeting, start, end: start, allDay: true };
  }
  return null;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function localDateValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${localDateValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const ZONE_KEY = 'job-tracker-timezones';
const PLUS_PX = 20;
const ZONE_PX = 62;
const NOW_COLOR = '#1a73e8';
const POPULAR_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

function timeZoneIds() {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return POPULAR_ZONES;
  }
}

function storedZones() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ZONE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const supported = new Set(timeZoneIds());
    return parsed.filter((zone): zone is string => typeof zone === 'string' && supported.has(zone));
  } catch {
    return [];
  }
}

function zoneInfo(timeZone: string, date = new Date()) {
  let abbr = timeZone;
  try {
    abbr = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value || timeZone;
  } catch {
    abbr = timeZone;
  }
  const city = (timeZone.split('/').slice(1).join(' / ') || timeZone).replace(/_/g, ' ');
  return { timeZone, abbr, city };
}

function zonedClock(date: Date, timeZone: string, withMinutes: boolean) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    const period = parts.find((part) => part.type === 'dayPeriod')?.value ?? '';
    if (!withMinutes && minute === '00') return `${hour} ${period}`.trim();
    return `${hour}:${minute} ${period}`.trim();
  } catch {
    return '';
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function heading(view: View, cursor: Date) {
  if (view === 'day') {
    return `${WEEKDAYS[cursor.getDay()]}, ${MONTHS[cursor.getMonth()]} ${cursor.getDate()}, ${cursor.getFullYear()}`;
  }
  if (view === 'week') {
    const start = startOfWeek(cursor);
    const end = addDays(start, 6);
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
    }
    if (start.getFullYear() === end.getFullYear()) {
      return `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()} – ${MONTHS_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()} – ${MONTHS_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
}

export function MeetingCalendar() {
  const router = useRouter();
  const gridRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(() => new Date());
  const [meetings, setMeetings] = useState<CalendarMeeting[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [proposed, setProposed] = useState<{ start: string; end: string } | null>(null);
  const [menu, setMenu] = useState<{ meeting: CalendarMeeting; x: number; y: number } | null>(null);
  const [details, setDetails] = useState<CalendarMeeting | null>(null);

  const placed = useMemo(
    () => meetings.map(placeMeeting).filter((item): item is PlacedMeeting => Boolean(item)),
    [meetings],
  );

  async function load() {
    try {
      const response = await api.listMeetings();
      setMeetings(response.meetings);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load meetings');
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (view === 'month') return;
    const node = gridRef.current;
    if (!node) return;
    const frame = requestAnimationFrame(() => {
      const current = new Date();
      const visible = (view === 'day' ? [startOfDay(cursor)] : Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index)))
        .some((day) => sameDay(day, current));
      const hour = visible ? Math.max(0, current.getHours() + current.getMinutes() / 60 - 2) : 8;
      node.scrollTop = hour * HOUR_PX;
    });
    return () => cancelAnimationFrame(frame);
  }, [view, cursor]);

  function shift(direction: number) {
    const next = new Date(cursor);
    if (view === 'month') next.setMonth(next.getMonth() + direction);
    else if (view === 'week') next.setDate(next.getDate() + direction * 7);
    else next.setDate(next.getDate() + direction);
    setCursor(next);
  }

  function openMenu(meeting: CalendarMeeting, event: React.MouseEvent) {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ meeting, x: rect.left, y: Math.min(rect.bottom + 4, window.innerHeight - 96) });
  }

  const days = view === 'day' ? [startOfDay(cursor)] : Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index));

  return (
    <div className="flex h-full flex-col bg-white" onClick={() => setMenu(null)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
        <button type="button" className="btn-secondary" onClick={() => setCursor(new Date())}>
          Today
        </button>
        <button type="button" className="btn-secondary px-2" aria-label="Previous" onClick={() => shift(-1)}>
          ‹
        </button>
        <button type="button" className="btn-secondary px-2" aria-label="Next" onClick={() => shift(1)}>
          ›
        </button>
        <h1 className="min-w-[12rem] text-lg font-medium text-slate-800">{heading(view, cursor)}</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-slate-300">
            {(['day', 'week', 'month'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={classNames(
                  'px-3 py-1.5 text-sm capitalize',
                  view === option ? 'bg-brand-50 font-medium text-brand-800' : 'bg-white text-slate-600 hover:bg-slate-50',
                )}
                onClick={() => setView(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-700 text-white shadow hover:bg-brand-800"
            aria-label="Add meeting"
            onClick={(event) => {
              event.stopPropagation();
              setProposed(null);
              setCreating(true);
            }}
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {error ? <p className="px-4 py-2 text-sm text-red-600">{error}</p> : null}

      {view === 'month' ? (
        <MonthView
          cursor={cursor}
          meetings={placed}
          onOpenDay={(day) => {
            setCursor(day);
            setView('day');
          }}
          onOpenMenu={openMenu}
        />
      ) : (
        <TimeGrid
          gridRef={gridRef}
          days={days}
          meetings={placed}
          onOpenMenu={openMenu}
          onCreateRange={(start, end) => {
            setProposed({ start: localDateTimeValue(start), end: localDateTimeValue(end) });
            setCreating(true);
          }}
        />
      )}

      {menu ? (
        <div
          className="fixed z-40 w-44 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            onClick={() =>
              router.push(`/jobs/${menu.meeting.jobId}?interview=${menu.meeting.interview._id}`)
            }
          >
            Open on the job
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setDetails(menu.meeting);
              setMenu(null);
            }}
          >
            View meeting
          </button>
        </div>
      ) : null}

      <CreateMeetingModal
        open={creating}
        proposed={proposed}
        onClose={() => {
          setCreating(false);
          setProposed(null);
        }}
        onCreated={async (startsAt, warning) => {
          setCreating(false);
          setCursor(startsAt);
          setView('week');
          await load();
          if (warning) setError(warning);
        }}
      />
      <MeetingDetailsModal meeting={details} onClose={() => setDetails(null)} />
    </div>
  );
}

const SNAP_MINUTES = 15;

interface TimeDrag {
  day: Date;
  anchor: number;
  originY: number;
  start: number;
  end: number;
}

function minutesFromPointer(column: HTMLElement, clientY: number) {
  const rect = column.getBoundingClientRect();
  const y = Math.min(Math.max(clientY - rect.top, 0), rect.height - 1);
  return Math.floor((y / HOUR_PX) * 60);
}

function selectionMinutes(anchorMin: number, pointerMin: number, click: boolean) {
  const limit = 24 * 60;
  const anchor = Math.min(Math.max(Math.floor(anchorMin / SNAP_MINUTES) * SNAP_MINUTES, 0), limit - SNAP_MINUTES);
  const pointer = Math.min(Math.max(Math.floor(pointerMin / SNAP_MINUTES) * SNAP_MINUTES, 0), limit - SNAP_MINUTES);
  if (click) return { start: anchor, end: Math.min(anchor + 60, limit) };
  const start = Math.min(anchor, pointer);
  const end = Math.min(Math.max(anchor, pointer) + SNAP_MINUTES, limit);
  return { start, end: Math.max(end, start + SNAP_MINUTES) };
}

function atMinutes(day: Date, minutes: number) {
  const date = startOfDay(day);
  date.setMinutes(minutes);
  return date;
}

function TimeGrid({
  gridRef,
  days,
  meetings,
  onOpenMenu,
  onCreateRange,
}: {
  gridRef: React.RefObject<HTMLDivElement>;
  days: Date[];
  meetings: PlacedMeeting[];
  onOpenMenu: (meeting: CalendarMeeting, event: React.MouseEvent) => void;
  onCreateRange: (start: Date, end: Date) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [extraZones, setExtraZones] = useState<string[]>([]);
  const [zonesReady, setZonesReady] = useState(false);
  const [picking, setPicking] = useState(false);
  const localZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const zones = useMemo(
    () => [...extraZones.filter((zone) => zone !== localZone), localZone],
    [extraZones, localZone],
  );
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index);
  const anchor = days[0] ?? now;
  const gutter = PLUS_PX + zones.length * ZONE_PX;
  const columns = `${gutter}px repeat(${days.length}, minmax(0, 1fr))`;
  const zoneColumns = `${PLUS_PX}px repeat(${zones.length}, ${ZONE_PX}px)`;
  const showsNow = days.some((day) => sameDay(day, now));
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setExtraZones(storedZones());
    setZonesReady(true);
  }, []);

  useEffect(() => {
    if (!zonesReady) return;
    window.localStorage.setItem(ZONE_KEY, JSON.stringify(extraZones));
  }, [extraZones, zonesReady]);

  useEffect(() => {
    if (!picking) return undefined;
    function close() {
      setPicking(false);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [picking]);

  function addZone(timeZone: string) {
    setExtraZones((current) => (current.includes(timeZone) || timeZone === localZone ? current : [...current, timeZone]));
    setPicking(false);
  }

  function removeZone(timeZone: string) {
    setExtraZones((current) => current.filter((zone) => zone !== timeZone));
  }

  const [drag, setDrag] = useState<TimeDrag | null>(null);
  const dragRef = useRef<TimeDrag | null>(null);
  dragRef.current = drag;

  function beginDrag(event: React.PointerEvent<HTMLDivElement>, day: Date) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    const column = event.currentTarget;
    const anchor = minutesFromPointer(column, event.clientY);
    const range = selectionMinutes(anchor, anchor, true);
    const next = { day, anchor, originY: event.clientY, start: range.start, end: range.end };
    dragRef.current = next;
    setDrag(next);
    try {
      column.setPointerCapture(event.pointerId);
    } catch {
      // A drag can still follow the pointer when the browser will not capture it.
    }
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>, day: Date) {
    const current = dragRef.current;
    if (!current || !sameDay(current.day, day)) return;
    const pointer = minutesFromPointer(event.currentTarget, event.clientY);
    const range = selectionMinutes(current.anchor, pointer, Math.abs(event.clientY - current.originY) < 6);
    const next = { ...current, start: range.start, end: range.end };
    dragRef.current = next;
    setDrag(next);
  }

  function finishDrag(event: React.PointerEvent<HTMLDivElement>, day: Date) {
    const current = dragRef.current;
    if (!current || !sameDay(current.day, day)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDrag(null);
    onCreateRange(atMinutes(current.day, current.start), atMinutes(current.day, current.end));
  }

  return (
    <div ref={gridRef} className="min-h-0 flex-1 overflow-auto">
      <div className="sticky top-0 z-20 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: columns }}>
        <div className="relative grid items-end" style={{ gridTemplateColumns: zoneColumns }}>
          <button
            type="button"
            className="mb-1 flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            aria-label="Add timezone"
            title="Add timezone"
            onClick={(event) => {
              event.stopPropagation();
              setPicking((open) => !open);
            }}
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
          {zones.map((timeZone) => {
            const info = zoneInfo(timeZone, anchor);
            return (
              <div key={timeZone} className="relative overflow-hidden px-1 pb-1 text-right leading-tight" title={info.abbr}>
                {timeZone !== localZone ? (
                  <button
                    type="button"
                    className="absolute left-0 top-0 px-0.5 text-[10px] leading-none text-slate-400 hover:text-red-600"
                    aria-label={`Remove ${info.abbr}`}
                    onClick={() => removeZone(timeZone)}
                  >
                    ×
                  </button>
                ) : null}
                <div className="truncate text-[11px] font-medium text-slate-700">{info.abbr}</div>
              </div>
            );
          })}
          {picking ? (
            <TimeZonePicker
              existing={zones}
              onAdd={addZone}
              onClose={() => setPicking(false)}
            />
          ) : null}
        </div>
        {days.map((day) => (
          <div key={day.toISOString()} className="px-2 py-2 text-center">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              {WEEKDAYS[day.getDay()].slice(0, 3)}
            </div>
            <div
              className={classNames(
                'mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm',
                sameDay(day, now) ? 'bg-brand-700 font-medium text-white' : 'text-slate-800',
              )}
            >
              {day.getDate()}
            </div>
          </div>
        ))}
      </div>

      <div className="relative grid" style={{ gridTemplateColumns: columns }}>
        <div className="relative grid" style={{ gridTemplateColumns: zoneColumns }}>
          <div />
          {zones.map((timeZone) => (
            <div key={timeZone} className="relative">
              {hours.map((hour) => (
                <div key={hour} className="relative text-right text-[10px] text-slate-400" style={{ height: HOUR_PX }}>
                  {hour > 0 ? (
                    <span className="absolute -top-2 right-1">
                      {zonedClock(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), hour), timeZone, false)}
                    </span>
                  ) : null}
                </div>
              ))}
              {showsNow ? (
                <div
                  className="absolute right-1 z-10 -translate-y-1/2 bg-white px-0.5 text-[10px] font-medium"
                  style={{ top: nowTop, color: NOW_COLOR }}
                >
                  {zonedClock(now, timeZone, true)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {days.map((day) => {
          const timed = layoutTimed(meetings.filter((item) => !item.allDay && sameDay(item.start, day)));
          return (
            <div
              key={day.toISOString()}
              className="relative select-none border-l border-slate-200"
              onPointerDown={(event) => beginDrag(event, day)}
              onPointerMove={(event) => moveDrag(event, day)}
              onPointerUp={(event) => finishDrag(event, day)}
              onPointerCancel={() => {
                dragRef.current = null;
                setDrag(null);
              }}
            >
              {hours.map((hour) => (
                <div key={hour} className="border-b border-slate-100" style={{ height: HOUR_PX }} />
              ))}
              {timed.map((item) => {
                const style = blockStyle(item.start, item.end);
                const tone = colorFor(item.meeting.jobId);
                return (
                  <button
                    key={item.meeting.interview._id}
                    type="button"
                    className="absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[12px] leading-snug"
                    title={interviewStepLabel(item.meeting.step || 1)}
                    style={{
                      top: style.top,
                      height: style.height,
                      left: `calc(${(item.col / item.cols) * 100}% + 2px)`,
                      width: `calc(${100 / item.cols}% - 4px)`,
                      background: tone.bg,
                      borderLeftColor: tone.border,
                      color: tone.text,
                    }}
                    onClick={(event) => onOpenMenu(item.meeting, event)}
                  >
                    <span className="block truncate font-medium">{formatTime(item.start)} {item.meeting.jobTitle}</span>
                    <span className="block truncate opacity-80">{item.meeting.interview.interviewers[0]?.name || item.meeting.companyName}</span>
                  </button>
                );
              })}
              {drag && sameDay(drag.day, day) ? (
                <div
                  className="pointer-events-none absolute inset-x-1 z-20 overflow-hidden rounded-md border border-brand-400 bg-brand-50 px-1.5 py-1 text-[12px] leading-snug text-brand-800"
                  style={{
                    top: (drag.start / 60) * HOUR_PX,
                    height: Math.max(((drag.end - drag.start) / 60) * HOUR_PX - 2, 16),
                  }}
                >
                  <span className="block truncate font-medium">
                    {formatTime(atMinutes(day, drag.start))} – {formatTime(atMinutes(day, drag.end))}
                  </span>
                </div>
              ) : null}
              {sameDay(day, now) ? (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 border-t-2"
                  style={{ top: nowTop, borderColor: NOW_COLOR }}
                  aria-hidden="true"
                >
                  <span className="absolute -left-1.5 -top-[5px] h-2.5 w-2.5 rounded-full" style={{ background: NOW_COLOR }} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeZonePicker({
  existing,
  onAdd,
  onClose,
}: {
  existing: string[];
  onAdd: (timeZone: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const taken = new Set(existing);
    const q = query.trim().toLowerCase();
    const source = q ? timeZoneIds() : POPULAR_ZONES;
    return source
      .filter((zone) => !taken.has(zone))
      .filter((zone) => {
        if (!q) return true;
        const info = zoneInfo(zone);
        return `${zone} ${info.city} ${info.abbr}`.toLowerCase().includes(q);
      })
      .slice(0, 40);
  }, [existing, query]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="absolute left-1 top-full z-30 mt-1 w-72 rounded-md border border-slate-200 bg-white p-2 shadow-lg"
      onClick={(event) => event.stopPropagation()}
    >
      <input
        className="input"
        placeholder="Search timezones"
        aria-label="Search timezones"
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="mt-1 max-h-56 overflow-auto">
        {matches.length === 0 ? <li className="px-2 py-2 text-sm text-slate-400">No timezones match.</li> : null}
        {matches.map((timeZone) => {
          const info = zoneInfo(timeZone);
          return (
            <li key={timeZone}>
              <button
                type="button"
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
                onClick={() => onAdd(timeZone)}
              >
                <span className="text-sm font-medium text-slate-800">{info.city}</span>
                <span className="ml-2 text-xs text-slate-500">{info.abbr}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function monthGrid(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);
  const count = Math.round((startOfDay(gridEnd).getTime() - gridStart.getTime()) / 86400000) + 1;
  return Array.from({ length: count }, (_, index) => addDays(gridStart, index));
}

function MonthView({
  cursor,
  meetings,
  onOpenDay,
  onOpenMenu,
}: {
  cursor: Date;
  meetings: PlacedMeeting[];
  onOpenDay: (day: Date) => void;
  onOpenMenu: (meeting: CalendarMeeting, event: React.MouseEvent) => void;
}) {
  const cells = monthGrid(cursor);
  const weeks = cells.length / 7;
  const today = new Date();

  return (
    <div
      className="grid min-h-0 flex-1 border-l border-t border-slate-200"
      style={{
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))`,
      }}
    >
      {cells.map((day, index) => {
        const inMonth = day.getMonth() === cursor.getMonth();
        const isToday = sameDay(day, today);
        const items = meetings.filter((item) => sameDay(item.start, day));
        const visible = items.slice(0, 3);
        const hidden = items.length - visible.length;
        const label = day.getDate() === 1 ? `${MONTHS_SHORT[day.getMonth()]} ${day.getDate()}` : String(day.getDate());
        return (
          <div key={day.toISOString()} className="flex min-h-0 flex-col overflow-hidden border-b border-r border-slate-200">
            {index < 7 ? (
              <div className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {WEEKDAYS[day.getDay()].slice(0, 3)}
              </div>
            ) : null}
            <div className="px-1.5 pt-0.5">
              <button
                type="button"
                className={classNames(
                  'inline-flex h-6 items-center justify-center rounded-full text-xs',
                  label.length > 2 ? 'px-2' : 'w-6',
                  isToday ? 'bg-brand-700 font-medium text-white' : inMonth ? 'text-slate-800 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-100',
                )}
                onClick={() => onOpenDay(day)}
              >
                {label}
              </button>
            </div>
            <div className="mt-0.5 min-h-0 flex-1 space-y-0.5 overflow-hidden px-1 pb-1">
              {visible.map((item) => (
                <EventChip key={item.meeting.interview._id} item={item} onOpenMenu={onOpenMenu} pill />
              ))}
              {hidden > 0 ? (
                <button type="button" className="px-1 text-[11px] text-slate-500 hover:underline" onClick={() => onOpenDay(day)}>
                  +{hidden} more
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventChip({
  item,
  onOpenMenu,
  pill = false,
}: {
  item: PlacedMeeting;
  onOpenMenu: (meeting: CalendarMeeting, event: React.MouseEvent) => void;
  pill?: boolean;
}) {
  const tone = colorFor(item.meeting.jobId);
  return (
    <button
      type="button"
      className={classNames(
        'block w-full truncate border-l-[3px] text-left text-[12px] leading-4',
        pill ? 'rounded px-1.5 py-0.5' : 'rounded px-1',
      )}
      title={interviewStepLabel(item.meeting.step || 1)}
      style={{ background: tone.bg, borderLeftColor: tone.border, color: tone.text }}
      onClick={(event) => onOpenMenu(item.meeting, event)}
    >
      {item.allDay ? item.meeting.jobTitle : `${formatTime(item.start)} ${item.meeting.jobTitle}`}
    </button>
  );
}

function blockStyle(start: Date, end: Date) {
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = Math.max(end.getHours() * 60 + end.getMinutes(), startMin + 30);
  const viewStart = START_HOUR * 60;
  const viewEnd = END_HOUR * 60;
  const topMin = Math.max(startMin, viewStart);
  const bottomMin = Math.min(endMin, viewEnd);
  return {
    top: ((topMin - viewStart) / 60) * HOUR_PX,
    height: Math.max(((bottomMin - topMin) / 60) * HOUR_PX - 2, 20),
  };
}

function layoutTimed(items: PlacedMeeting[]) {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime());
  const placed: Array<PlacedMeeting & { col: number; cols: number }> = [];
  const active: Array<PlacedMeeting & { col: number; cols: number }> = [];
  for (const item of sorted) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].end.getTime() <= item.start.getTime()) active.splice(index, 1);
    }
    const used = new Set(active.map((entry) => entry.col));
    let col = 0;
    while (used.has(col)) col += 1;
    const next = { ...item, col, cols: 1 };
    active.push(next);
    const cols = Math.max(...active.map((entry) => entry.col)) + 1;
    for (const entry of active) entry.cols = Math.max(entry.cols, cols);
    placed.push(next);
  }
  return placed;
}

function CreateMeetingModal({
  open,
  proposed,
  onClose,
  onCreated,
}: {
  open: boolean;
  proposed: { start: string; end: string } | null;
  onClose: () => void;
  onCreated: (startsAt: Date, warning?: string) => Promise<void>;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [jobId, setJobId] = useState('');
  const [openList, setOpenList] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [interviewer, setInterviewer] = useState('');
  const [conversation, setConversation] = useState('');
  const [feedback, setFeedback] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (proposed) {
      setStartsAt(proposed.start);
      setEndsAt(proposed.end);
    } else {
      const start = new Date();
      start.setMinutes(0, 0, 0);
      start.setHours(start.getHours() + 1);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      setStartsAt(localDateTimeValue(start));
      setEndsAt(localDateTimeValue(end));
    }
    setQuery('');
    setJobId('');
    setInterviewer('');
    setConversation('');
    setFeedback('');
    setFile(null);
    setError('');
    api.listJobs().then((response) => {
      setJobs(response.jobs.filter((job) => job.status !== 'Closed'));
    }).catch(() => setJobs([]));
  }, [open, proposed]);

  const selected = jobs.find((job) => job._id === jobId);
  const matches = jobs.filter((job) => {
    const haystack = `${job.title} ${job.companyName}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!jobId) {
      setError('Choose a job.');
      return;
    }
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setError('Enter a start and an end, with the end after the start.');
      return;
    }
    if (!interviewer.trim()) {
      setError('Enter the interviewer.');
      return;
    }
    const history = conversation.trim() ? [{ speaker: '', message: conversation.trim() }] : [];
    setSaving(true);
    setError('');
    try {
      const created = await api.createMeeting(jobId, {
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        date: localDateValue(start),
        interviewer: interviewer.trim(),
        conversation: history,
        feedback: feedback.trim(),
      });
      if (file) {
        try {
          await api.uploadInterviewAttachment(jobId, created.interviewId, file);
        } catch (uploadError) {
          const warning = uploadError instanceof Error
            ? `Saved the meeting, but the file was not attached. ${uploadError.message}`
            : 'Saved the meeting, but the file was not attached.';
          await onCreated(start, warning);
          return;
        }
      }
      await onCreated(start);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the meeting');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Add a meeting"
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="meeting-form" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save meeting'}
          </button>
        </>
      }
    >
      <form id="meeting-form" className="space-y-4" onSubmit={save}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-slate-600">
            Starts
            <input className="input mt-1" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
          </label>
          <label className="block text-sm text-slate-600">
            Ends
            <input className="input mt-1" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
          </label>
        </div>
        <label className="block text-sm text-slate-600">
          Interviewer
          <input className="input mt-1" value={interviewer} onChange={(event) => setInterviewer(event.target.value)} required />
        </label>
        <div className="relative">
          <label className="block text-sm text-slate-600" htmlFor="meeting-job">
            Job
          </label>
          <input
            id="meeting-job"
            className="input mt-1"
            placeholder="Search active jobs"
            value={openList ? query : selected ? `${selected.title} — ${selected.companyName}` : query}
            onFocus={() => {
              setOpenList(true);
              setQuery('');
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setJobId('');
              setOpenList(true);
            }}
            autoComplete="off"
          />
          {openList ? (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow">
              {matches.length === 0 ? <li className="px-3 py-2 text-sm text-slate-400">No active jobs match.</li> : null}
              {matches.map((job) => (
                <li key={job._id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => {
                      setJobId(job._id);
                      setQuery(`${job.title} — ${job.companyName}`);
                      setOpenList(false);
                    }}
                  >
                    <span className="font-medium text-slate-800">{job.title}</span>
                    <span className="ml-2 text-slate-500">{job.companyName}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <label className="block text-sm text-slate-600">
          Conversation history
          <textarea className="input mt-1 min-h-20" value={conversation} onChange={(event) => setConversation(event.target.value)} />
        </label>
        <label className="block text-sm text-slate-600">
          Feedback
          <textarea className="input mt-1 min-h-20" value={feedback} onChange={(event) => setFeedback(event.target.value)} />
        </label>
        <label className="block text-sm text-slate-600">
          Attachment
          <input className="mt-1 block w-full text-sm" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Modal>
  );
}

function MeetingDetailsModal({ meeting, onClose }: { meeting: CalendarMeeting | null; onClose: () => void }) {
  if (!meeting) return null;
  const interview = meeting.interview;
  const start = interview.startsAt ? new Date(interview.startsAt) : interview.date ? new Date(interview.date) : null;
  const end = interview.endsAt ? new Date(interview.endsAt) : null;
  const when = start
    ? `${start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${end ? ` – ${formatTime(end)}` : ''}`
    : 'No time set';

  return (
    <Modal open title={meeting.jobTitle} onClose={onClose} width="lg">
      <div className="space-y-3 text-sm text-slate-700">
        <p>{meeting.companyName}</p>
        <p>{when}</p>
        <p>Interviewer: {interview.interviewers.map((person) => person.name).join(', ') || 'Not recorded'}</p>
        <div>
          <h3 className="font-medium text-slate-800">Conversation</h3>
          {interview.conversation.length === 0 ? <p className="text-slate-400">None</p> : (
            <ul className="mt-1 space-y-1">
              {interview.conversation.map((entry) => (
                <li key={entry._id} className="whitespace-pre-wrap">
                  {entry.speaker ? <span className="font-medium">{entry.speaker}: </span> : null}
                  {entry.message}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="font-medium text-slate-800">Feedback</h3>
          {interview.feedback.length === 0 ? <p className="text-slate-400">None</p> : (
            <ul className="mt-1 space-y-1">
              {interview.feedback.map((note) => <li key={note._id}>{note.body}</li>)}
            </ul>
          )}
        </div>
        <div>
          <h3 className="font-medium text-slate-800">Files</h3>
          {interview.attachments.length === 0 ? <p className="text-slate-400">None</p> : (
            <ul className="mt-1 space-y-1">
              {interview.attachments.map((file) => (
                <li key={file._id}>
                  <button
                    type="button"
                    className="text-brand-700 hover:underline"
                    onClick={() => downloadInterviewAttachment(meeting.jobId, interview._id, file._id, file.originalName)}
                  >
                    {file.originalName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
