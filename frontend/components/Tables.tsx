/* The worst days table. Rank is carried by order and weight, not colour. */

import { dateName, num, signedPct, worstDays } from "@/lib/data";

const th = "label text-left" as const;
const cell = { padding: "12px 16px 12px 0", borderTop: "1px solid var(--hairline)", verticalAlign: "top" as const };
const hd = { paddingBottom: 10, paddingRight: 16 };

export function WorstDays() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="w-full tabular" style={{ borderCollapse: "collapse", minWidth: 720 }}>
        <thead>
          <tr>
            <th className={th} style={{ ...hd, width: "18%" }}>Day</th>
            <th className={th} style={{ ...hd, width: "20%" }}>Line</th>
            <th className={th} style={{ ...hd, textAlign: "right", width: "10%" }}>Actual</th>
            <th className={th} style={{ ...hd, textAlign: "right", width: "10%" }}>LightGBM</th>
            <th className={th} style={{ ...hd, textAlign: "right", width: "10%" }}>Naive</th>
            <th className={th} style={{ ...hd, textAlign: "right", width: "8%" }}>Error</th>
            <th className={th} style={{ ...hd, paddingLeft: 16 }}>Why</th>
          </tr>
        </thead>
        <tbody>
          {worstDays.slice(0, 12).map((w) => (
            <tr key={`${w.mode}-${w.date}`}>
              <td style={{ ...cell, whiteSpace: "nowrap" }}>
                {dateName(w.date)}
                <span className="caption muted" style={{ display: "block", marginTop: 2 }}>
                  day {w.h} from {dateName(w.origin)}
                </span>
              </td>
              <td style={cell}>{w.label}</td>
              <td style={{ ...cell, textAlign: "right" }}>{num(w.actual)}</td>
              <td style={{ ...cell, textAlign: "right" }}>{num(w.yhat)}</td>
              <td style={{ ...cell, textAlign: "right", color: "var(--text-secondary)" }}>{num(w.naive)}</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 570 }}>{w.actual === 0 ? "—" : signedPct((w.yhat - w.actual) / w.actual, 0)}</td>
              <td className="body-sm" style={{ ...cell, paddingLeft: 16, color: "var(--text-secondary)" }}>
                {w.holiday ? w.holiday : w.day_type === "holiday-adjacent" ? "eve or day after a holiday" : w.day_type}
                {w.outlier ? " · flagged by Turnstile" : ""}
                {w.actual === 0 ? " · zero reported" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
