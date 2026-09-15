"use client";

/* One daily chart used twice: the forecast ahead, and any backtest window.
   Days along the x axis, an optional split where the observed data ends, a
   band behind the main forecast, holiday names on the axis, and a hover readout
   listing every series at that day. Monochrome: series differ by texture. */

import { useState, type MouseEvent } from "react";
import { compact, dayMonth, num, weekdayName } from "@/lib/data";

const W = 960;
const H = 320;
const PAD = { top: 20, right: 24, bottom: 52, left: 56 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;

export type LineStyle = { stroke: string; width: number; dash?: string; css: string };
export type Line = { key: string; label: string; values: (number | null)[]; style: LineStyle; dots?: boolean };

// Observed data is the one solid Onyx line; every forecast is a texture on it.
export const OBSERVED: LineStyle = { stroke: "var(--color-onyx)", width: 1.75, css: "1.75px solid var(--color-onyx)" };
export const FORECAST: Record<"lgbm" | "lgbm_nohol" | "seasonal_naive", LineStyle> = {
  lgbm: { stroke: "var(--color-onyx)", width: 2, dash: "6 4", css: "2px dashed var(--color-onyx)" },
  lgbm_nohol: { stroke: "var(--color-onyx)", width: 1.5, dash: "1.5 3.5", css: "1.5px dotted var(--color-onyx)" },
  seasonal_naive: { stroke: "var(--color-slate-veil)", width: 1.25, css: "1.25px solid var(--color-slate-veil)" },
};

export default function LineChart({ dates, lines, band, split, holidays, marks, ariaLabel }: { dates: string[]; lines: Line[]; band?: { lo: (number | null)[]; hi: (number | null)[] }; split?: number; holidays?: Record<number, string>; marks?: number[]; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const N = dates.length;
  const all = lines.flatMap((l) => l.values.filter((v): v is number => v !== null)).concat(band ? band.hi.filter((v): v is number => v !== null) : []);
  const max = Math.max(1, ...all);
  const step = max > 2e6 ? 500e3 : max > 800e3 ? 200e3 : max > 300e3 ? 100e3 : max > 120e3 ? 50e3 : max > 40e3 ? 20e3 : max > 15e3 ? 5e3 : max > 5e3 ? 2e3 : max > 2e3 ? 1e3 : 500;
  const top = Math.ceil(max / step) * step;
  const x = (i: number) => PAD.left + (i / (N - 1)) * PW;
  const y = (v: number) => PAD.top + (1 - v / top) * PH;
  const ticks = Array.from({ length: top / step + 1 }, (_, k) => k * step);

  const path = (vals: (number | null)[]) => {
    let d = "";
    let open = false;
    vals.forEach((v, i) => {
      if (v === null) {
        open = false;
        return;
      }
      d += `${open ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      open = true;
    });
    return d.trim();
  };
  let bandPath = "";
  if (band) {
    const idx = band.lo.map((v, i) => (v !== null && band.hi[i] !== null ? i : -1)).filter((i) => i >= 0);
    if (idx.length > 1) {
      bandPath = idx.map((i, k) => `${k === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(band.hi[i]!).toFixed(1)}`).join(" ") + " " + [...idx].reverse().map((i) => `L${x(i).toFixed(1)} ${y(band.lo[i]!).toFixed(1)}`).join(" ") + " Z";
    }
  }

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / PW) * (N - 1));
    setHover(Math.min(N - 1, Math.max(0, i)));
  }

  const labelEvery = N > 40 ? 7 : N > 20 ? 2 : 1;
  // Regular labels step through the axis; a holiday label or the last day pre-empts
  // any regular label that would sit on top of it.
  const holidayIdx = new Set(Object.keys(holidays ?? {}).map(Number));
  const near = (i: number) => holidayIdx.has(i) || [...holidayIdx].some((h) => Math.abs(h - i) <= (N > 40 ? 3 : 1)) || (i !== N - 1 && N - 1 - i <= (N > 40 ? 3 : 1));
  const showLabel = (i: number) => holidayIdx.has(i) || i === N - 1 || (i % labelEvery === 0 && !near(i));
  const cardW = 236;
  const cardH = 26 + 16 * lines.filter((l) => hover !== null && l.values[hover] !== null).length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="band-wash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a769f" stopOpacity={0.22} />
          <stop offset="100%" stopColor="#5a769f" stopOpacity={0.08} />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--hairline)" />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tabular">
            {t === 0 ? "0" : compact(t)}
          </text>
        </g>
      ))}
      {split !== undefined && split > 0 && split < N && (
        <g>
          <line x1={x(split - 0.5)} x2={x(split - 0.5)} y1={PAD.top} y2={PAD.top + PH} stroke="var(--color-ash-mist)" strokeDasharray="2 3" />
          <text x={x(split - 0.5) + 6} y={PAD.top + 12} fontSize={11} fill="var(--text-secondary)">
            forecast →
          </text>
        </g>
      )}
      {dates.map((d, i) => {
        const hol = holidays?.[i];
        if (!showLabel(i)) return null;
        return (
          <g key={d}>
            <text x={x(i)} y={H - 30} textAnchor="middle" fontSize={11} fill={hol ? "var(--color-onyx)" : "var(--text-muted)"} fontWeight={hol ? 500 : 400}>
              {N <= 30 ? `${weekdayName(d)} ${dayMonth(d)}` : dayMonth(d)}
            </text>
            {hol && (
              <text x={x(i)} y={H - 14} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">
                {hol.length > 26 ? `${hol.slice(0, 25)}…` : hol}
              </text>
            )}
          </g>
        );
      })}
      {bandPath && <path d={bandPath} fill="url(#band-wash)" />}
      {lines.map((l) => (
        <path key={l.key} d={path(l.values)} fill="none" stroke={l.style.stroke} strokeWidth={l.style.width} strokeDasharray={l.style.dash} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {lines
        .filter((l) => l.dots)
        .map((l) => l.values.map((v, i) => (v === null ? null : <circle key={`${l.key}-${i}`} cx={x(i)} cy={y(v)} r={2.5} fill={l.style.stroke} />)))}
      {marks?.map((i) => {
        const v = lines[0].values[i];
        return v === null ? null : <circle key={`mark-${i}`} cx={x(i)} cy={y(v)} r={5} fill="none" stroke="var(--color-onyx)" strokeWidth={1.25} />;
      })}
      {hover !== null && (
        <g pointerEvents="none">
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + PH} stroke="var(--color-ash-mist)" strokeDasharray="2 3" />
          {lines.map((l) => {
            const v = l.values[hover];
            return v === null ? null : <circle key={l.key} cx={x(hover)} cy={y(v)} r={3.5} fill="var(--color-parchment-canvas)" stroke={l.style.stroke} strokeWidth={1.5} />;
          })}
          <g transform={`translate(${x(hover) > W * 0.6 ? x(hover) - cardW - 12 : x(hover) + 12}, ${PAD.top + 4})`}>
            <rect width={cardW} height={cardH} rx={8} fill="var(--color-parchment-canvas)" stroke="var(--hairline)" />
            <text x={12} y={18} fontSize={11} fill="var(--text-secondary)">
              {weekdayName(dates[hover])} {dayMonth(dates[hover])}
              {holidays?.[hover] ? ` · ${holidays[hover]}` : ""}
            </text>
            {lines
              .filter((l) => l.values[hover] !== null)
              .map((l, k) => (
                <text key={l.key} x={12} y={34 + 16 * k} fontSize={12} fill={l.style.stroke === "var(--color-ash-mist)" ? "var(--text-secondary)" : l.style.stroke} className="tabular">
                  {l.label} {num(l.values[hover])}
                </text>
              ))}
          </g>
        </g>
      )}
    </svg>
  );
}

export function LegendItem({ style, label }: { style: LineStyle; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" style={{ width: 18, height: 0, borderTop: style.css }} /> {label}
    </span>
  );
}

export const pillStyle = (active: boolean, small = false) => ({
  fontSize: small ? 13 : 14,
  padding: small ? "6px 12px" : "8px 14px",
  fontWeight: small ? 400 : 500,
  background: active ? "var(--color-onyx)" : undefined,
  color: active ? "var(--color-parchment-canvas)" : "var(--text-secondary)",
});
