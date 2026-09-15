import DayTypeChart from "@/components/DayTypeChart";
import ForecastChart from "@/components/ForecastChart";
import HorizonChart from "@/components/HorizonChart";
import { ByModeTable, Leaderboard, WorstDays } from "@/components/Tables";
import WindowBrowser from "@/components/WindowBrowser";
import { byDayType, byOutlier, dateName, dec, num, pct, series, summary } from "@/lib/data";

const REPO = "https://github.com/direenvy/headway";
const TURNSTILE = "https://turnstile-tawny.vercel.app";

function Stat({ label, value, note, strong = false }: { label: string; value: string; note: string; strong?: boolean }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <p className="label">{label}</p>
      <p className="tabular" style={{ fontSize: 24, lineHeight: 1.15, letterSpacing: "-0.24px", fontWeight: 400, marginTop: 12 }}>
        {value}
      </p>
      <p className="body-sm" style={{ marginTop: 6, color: "var(--text-secondary)", fontWeight: strong ? 500 : 400 }}>
        {note}
      </p>
    </div>
  );
}

function Section({ id, kicker, title, lede, children }: { id?: string; kicker: string; title: string; lede: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} style={{ paddingTop: "var(--section-gap)", scrollMarginTop: 24 }}>
      <p className="label">{kicker}</p>
      <h2 className="heading" style={{ marginTop: 12 }}>
        {title}
      </h2>
      <p className="subheading" style={{ marginTop: 10, marginBottom: 24, maxWidth: 680, color: "var(--text-secondary)" }}>
        {lede}
      </p>
      {children}
    </section>
  );
}

export default function Home() {
  const gain = 1 - summary.lgbm_mase / summary.naive_mase;
  const w = summary.worst;
  const wapeOf = (model: string, type: string) => byDayType.find((r) => r.model === model && r.day_type === type)?.wape ?? 0;
  const outlierWape = (model: string) => byOutlier.find((r) => r.model === model && r.outlier)?.wape ?? 0;
  const holidayGain = 1 - wapeOf("lgbm", "holiday") / wapeOf("lgbm_nohol", "holiday");

  return (
    <>
      {/* Hero: the dawn arc, edge to edge, the nav floating on its dark top and the headline carved into its light foot. */}
      <header className="relative" style={{ background: "var(--gradient-dawn-arc)", minHeight: "min(92vh, 860px)" }}>
        <nav className="mx-auto flex items-center justify-between px-6 lg:px-12" style={{ maxWidth: "var(--page-max-width)", height: 72 }}>
          <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-parchment-canvas)" }}>Headway</span>
          <div className="flex items-center gap-1">
            <a href="#scores" className="pill on-dark" style={{ fontSize: 14 }}>
              Scores
            </a>
            <a href="#loses" className="pill on-dark hidden sm:inline-flex" style={{ fontSize: 14, whiteSpace: "nowrap" }}>
              Where it loses
            </a>
            <span aria-hidden="true" style={{ width: 1, height: 16, background: "rgba(255,255,255,0.35)", margin: "0 8px" }} />
            <a href={REPO} target="_blank" rel="noreferrer" className="pill on-dark" style={{ fontSize: 14 }}>
              Repository
            </a>
          </div>
        </nav>
        <div className="mx-auto px-6 lg:px-12" style={{ maxWidth: "var(--page-max-width)", position: "absolute", left: 0, right: 0, bottom: 56 }}>
          <h1 className="display" style={{ maxWidth: 940 }}>
            Ridership fourteen days ahead, for every line, <span className="dissolve">scored against last week.</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2" style={{ marginTop: 24 }}>
            <a href="#ahead" className="pill" style={{ paddingLeft: 0 }}>
              The forecast ↓
            </a>
            <a href={TURNSTILE} target="_blank" rel="noreferrer" className="pill">
              Data from Turnstile ↗
            </a>
            <span className="body-sm tabular" style={{ color: "var(--text-secondary)" }}>
              Data to {dateName(summary.last_date)} · {summary.n_origins} backtest windows · {num(summary.scored_days)} scored days
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full px-6 lg:px-12" style={{ maxWidth: "var(--page-max-width)" }}>
        <section id="numbers" style={{ paddingTop: 48 }}>
          <p className="subheading" style={{ maxWidth: 760 }}>
            One gradient-boosted model forecasts the next {summary.horizon} days for {summary.series} rail and bus lines, using only the daily table Turnstile has
            checked. It is scored the honest way: {summary.n_origins} rolling origins over the last 52 weeks, every model seeing only what it could have seen, against the seasonal naive
            &mdash; last week&rsquo;s number for the same weekday.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" style={{ marginTop: 32 }}>
            <Stat label="LightGBM · MASE" value={dec(summary.lgbm_mase)} note={`seasonal naive ${dec(summary.naive_mase)} · ${pct(gain, 0)} less error`} strong />
            <Stat label="LightGBM · WAPE" value={pct(summary.lgbm_wape)} note={`of trips, all lines and horizons · naive ${pct(summary.naive_wape)}`} />
            <Stat label="Beats the naive on" value={`${summary.beats_naive} of ${summary.series} lines`} note={summary.beats_naive === summary.series ? "every line, by MASE" : "by MASE; the rest are named below"} />
            <Stat label="Worst day" value={`${Math.round(w.ape * 100)}% off`} note={`${w.label}, ${dateName(w.date)}${w.holiday ? ` — ${w.holiday}` : w.actual === 0 ? " — zero reported" : ""}`} strong />
          </div>
        </section>

        <Section id="ahead" kicker={`From ${dateName(summary.last_date)}`} title="The next fourteen days" lede="Eight weeks of observed trips, then the forecast. The band is the 10th to 90th percentile of the backtest's own errors at each horizon, not a formula's idea of them. Pick a line.">
          <div className="card" style={{ padding: "var(--card-padding)" }}>
            <ForecastChart />
          </div>
        </Section>

        <Section id="scores" kicker="52 weeks of backtest" title="How each model did" lede={<>MASE is mean absolute error divided by the in-sample error of the seasonal naive, so 1.00 means &ldquo;no better than last week&rdquo; and the number is comparable across a 190,000-trip line and a 3,000-trip one. Each line counts once.</>}>
          <div className="card" style={{ padding: "var(--card-padding)" }}>
            <Leaderboard />
          </div>
          <h3 className="heading-sm" style={{ marginTop: 48, marginBottom: 16 }}>
            Error by day ahead
          </h3>
          <div className="card" style={{ padding: "var(--card-padding)" }}>
            <HorizonChart />
          </div>
          <h3 className="heading-sm" style={{ marginTop: 48, marginBottom: 16 }}>
            Every line
          </h3>
          <p className="body-sm secondary" style={{ marginBottom: 16, maxWidth: 680 }}>
            MASE per line and model; the best in each row is set heavier. The last column is the naive&rsquo;s own daily error, the scale the row is measured in.
            {series.some((s) => s.beats_naive === false) && <> LightGBM loses to the naive on {series.filter((s) => s.beats_naive === false).map((s) => s.label).join(", ")}.</>}
          </p>
          <div className="card" style={{ padding: "var(--card-padding)" }}>
            <ByModeTable />
          </div>
        </Section>

        <Section id="loses" kicker="The honest part" title="Where it loses" lede={<>Split the scored days by what kind of day they were. Knowing the public-holiday calendar cuts LightGBM&rsquo;s holiday error by {pct(holidayGain, 0)}; the days nothing in the calendar explains &mdash; the ones Turnstile&rsquo;s outlier rule flags &mdash; stay at {pct(outlierWape("lgbm"), 0)} WAPE for every model.</>}>
          <div className="card" style={{ padding: "var(--card-padding)" }}>
            <DayTypeChart />
          </div>
          <h3 className="heading-sm" style={{ marginTop: 48, marginBottom: 16 }}>
            The worst days
          </h3>
          <p className="body-sm secondary" style={{ marginBottom: 16, maxWidth: 680 }}>
            LightGBM&rsquo;s twelve largest percentage misses across every window and line, with the naive&rsquo;s number for the same day and the reason where the calendar has one.
          </p>
          <div className="card" style={{ padding: "var(--card-padding)" }}>
            <WorstDays />
          </div>
          <h3 className="heading-sm" style={{ marginTop: 48, marginBottom: 16 }}>
            Any window, any line
          </h3>
          <div className="card" style={{ padding: "var(--card-padding)" }}>
            <WindowBrowser />
          </div>
        </Section>
      </main>

      {/* Footer: the gradient's darkest stop, as a solid — the page bookends itself. */}
      <footer style={{ marginTop: "var(--section-gap)", background: "var(--surface-dark)", color: "var(--color-parchment-canvas)" }}>
        <div className="mx-auto grid gap-8 px-6 py-12 md:grid-cols-[1fr_1fr] lg:px-12" style={{ maxWidth: "var(--page-max-width)" }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>Headway</p>
            <p className="body-sm" style={{ marginTop: 12, maxWidth: 520, color: "rgba(255,255,255,0.72)" }}>
              Source: <em>Daily Public Transport Ridership</em>, Prasarana Malaysia and the Ministry of Transport via data.gov.my, CC BY 4.0, as published by Turnstile after its checks. Public holidays from the <code>holidays</code> package, per state. Trips, not passengers. Backtest generated {summary.generated_at.slice(0, 10)}.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1 md:justify-end">
            <a href={TURNSTILE} target="_blank" rel="noreferrer" className="pill on-dark" style={{ fontSize: 14 }}>
              Turnstile ↗
            </a>
            <a href={REPO} target="_blank" rel="noreferrer" className="pill on-dark" style={{ fontSize: 14 }}>
              github.com/direenvy/headway ↗
            </a>
            <a href={`${REPO}/blob/main/results/backtest.csv`} target="_blank" rel="noreferrer" className="pill on-dark" style={{ fontSize: 14 }}>
              backtest.csv ↗
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
