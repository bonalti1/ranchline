"use client";

import { useMemo, useState } from "react";

const fenceChoices = [
  {
    id: "barbed",
    name: "5-strand barbed wire",
    detail: "Best value for cattle pasture",
    material: 2.15,
    labor: 1.75,
    spacing: 12,
    rollLength: 1320,
    strands: 5,
    gateCost: 950,
  },
  {
    id: "woven",
    name: "Woven field fence",
    detail: "Cattle, sheep and mixed livestock",
    material: 3.45,
    labor: 2.4,
    spacing: 10,
    rollLength: 330,
    strands: 1,
    gateCost: 1050,
  },
  {
    id: "electric",
    name: "High-tensile electric",
    detail: "Flexible pasture and cross-fencing",
    material: 1.45,
    labor: 1.55,
    spacing: 30,
    rollLength: 4000,
    strands: 6,
    gateCost: 875,
  },
  {
    id: "game",
    name: "8-foot game fence",
    detail: "Wildlife and high-security perimeter",
    material: 7.8,
    labor: 5.2,
    spacing: 10,
    rollLength: 330,
    strands: 1,
    gateCost: 2200,
  },
] as const;

const routeChoices = [
  { id: "perimeter", name: "Full perimeter", feet: 18640, note: "Entire ranch boundary" },
  { id: "north-east", name: "North + east lines", feet: 8960, note: "Two priority boundaries" },
  { id: "cross", name: "3 cross-fences", feet: 5280, note: "Create four paddocks" },
] as const;

const terrainChoices = [
  { id: "easy", name: "Mostly level", detail: "Open access", multiplier: 1 },
  { id: "rolling", name: "Rolling pasture", detail: "Some brush + slope", multiplier: 1.08 },
  { id: "rough", name: "Rough terrain", detail: "Rock, trees or steep grade", multiplier: 1.16 },
] as const;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function Chevron() {
  return <span aria-hidden="true">›</span>;
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState("1427 County Road 418, Hico, TX");
  const [finding, setFinding] = useState(false);
  const [propertyFound, setPropertyFound] = useState(false);
  const [routeId, setRouteId] = useState<(typeof routeChoices)[number]["id"]>("perimeter");
  const [fenceId, setFenceId] = useState<(typeof fenceChoices)[number]["id"]>("barbed");
  const [terrainId, setTerrainId] = useState<(typeof terrainChoices)[number]["id"]>("rolling");
  const [gates, setGates] = useState(3);
  const [proposalOpen, setProposalOpen] = useState(false);

  const route = routeChoices.find((item) => item.id === routeId)!;
  const fence = fenceChoices.find((item) => item.id === fenceId)!;
  const terrain = terrainChoices.find((item) => item.id === terrainId)!;

  const estimate = useMemo(() => {
    const material = route.feet * fence.material;
    const labor = route.feet * fence.labor;
    const gatesCost = gates * fence.gateCost;
    const siteConditions = (material + labor + gatesCost) * (terrain.multiplier - 1);
    const mobilization = route.feet > 10000 ? 2400 : 1450;
    const directCost = material + labor + gatesCost + siteConditions + mobilization;
    const margin = directCost * 0.18;
    const total = directCost + margin;
    const braces = routeId === "cross" ? 12 + gates * 2 : 8 + gates * 2;

    return {
      material,
      labor,
      gatesCost,
      siteConditions,
      mobilization,
      directCost,
      margin,
      total,
      low: total * 0.95,
      high: total * 1.08,
      posts: Math.ceil(route.feet / fence.spacing) + braces * 2,
      rolls: Math.ceil((route.feet * fence.strands) / fence.rollLength),
      braces,
      days: Math.max(2, Math.ceil(route.feet / (fence.id === "game" ? 560 : 920))),
    };
  }, [fence, gates, route, route.feet, routeId, terrain.multiplier]);

  function findProperty() {
    if (!address.trim()) return;
    setFinding(true);
    window.setTimeout(() => {
      setFinding(false);
      setPropertyFound(true);
      setStep(2);
    }, 650);
  }

  function createEstimate() {
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setStep(1)} aria-label="RanchLine home">
          <span className="brand-mark">R</span>
          <span>RanchLine</span>
        </button>
        <div className="topbar-actions">
          <span className="demo-pill"><i /> Demo property</span>
          <button className="quiet-button" onClick={() => setStep(1)}>Start over</button>
        </div>
      </header>

      <section className="workspace">
        <div className="intro-row">
          <div>
            <p className="eyebrow">Agricultural fence estimating</p>
            <h1>From ranch to quote,<br />without the guesswork.</h1>
          </div>
          <div className="stepper" aria-label="Estimate progress">
            {[
              [1, "Property"],
              [2, "Fence plan"],
              [3, "Estimate"],
            ].map(([number, label], index) => (
              <div className={`step ${step >= number ? "active" : ""}`} key={number}>
                <span>{step > number ? "✓" : number}</span>
                <small>{label}</small>
                {index < 2 && <i />}
              </div>
            ))}
          </div>
        </div>

        {step === 1 && (
          <section className="property-start">
            <div className="search-card">
              <span className="section-number">01</span>
              <p className="eyebrow">Find the land</p>
              <h2>Which property are we fencing?</h2>
              <p className="supporting">Search an address or parcel number. We’ll bring in the boundary, acreage and land conditions.</p>
              <label htmlFor="property-search">Property address or APN</label>
              <div className="search-box">
                <span aria-hidden="true">⌖</span>
                <input
                  id="property-search"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && findProperty()}
                  placeholder="Enter a ranch address or APN"
                />
                <button onClick={findProperty} disabled={finding || !address.trim()}>
                  {finding ? "Finding…" : "Find property"} <Chevron />
                </button>
              </div>
              <div className="sample-hint">
                <span>Try the sample</span>
                <button onClick={() => setAddress("1427 County Road 418, Hico, TX")}>Circle B Ranch · 417.8 acres</button>
              </div>
            </div>
            <div className="start-visual" aria-hidden="true">
              <div className="sun" />
              <div className="horizon hill-one" />
              <div className="horizon hill-two" />
              <div className="fence-post post-one" />
              <div className="fence-post post-two" />
              <div className="fence-post post-three" />
              <div className="wire wire-one" />
              <div className="wire wire-two" />
              <p>Built for wide open country.</p>
            </div>
          </section>
        )}

        {step >= 2 && propertyFound && (
          <div className="planning-grid">
            <section className="map-column">
              <div className="map-card">
                <div className="map-toolbar">
                  <div>
                    <span className="verified">✓ Parcel found</span>
                    <h2>Circle B Ranch</h2>
                    <p>1427 County Road 418 · Hico, Texas</p>
                  </div>
                  <button className="edit-link" onClick={() => setStep(1)}>Change</button>
                </div>
                <div className={`map-canvas route-${routeId}`} role="img" aria-label={`Map of Circle B Ranch showing the ${route.name.toLowerCase()} fence route`}>
                  <div className="map-grid" />
                  <div className="contour contour-a" />
                  <div className="contour contour-b" />
                  <div className="contour contour-c" />
                  <div className="creek" />
                  <div className="road"><span>CR 418</span></div>
                  <div className="parcel-shape"><span>417.8<br /><small>ACRES</small></span></div>
                  <div className="barn">■ <span>Barn</span></div>
                  <div className="water water-a">●</div>
                  <div className="water water-b">●</div>
                  <div className="fence-segment segment-north" />
                  <div className="fence-segment segment-east" />
                  <div className="fence-segment segment-south" />
                  <div className="fence-segment segment-west" />
                  <div className="fence-segment segment-cross-a" />
                  <div className="fence-segment segment-cross-b" />
                  <div className="fence-segment segment-cross-c" />
                  <div className="gate-marker gate-one">G</div>
                  <div className="gate-marker gate-two">G</div>
                  <div className="map-legend">
                    <span><i className="legend-fence" /> Proposed fence</span>
                    <span><i className="legend-water" /> Water</span>
                  </div>
                </div>
                <div className="property-facts">
                  <div><span>Parcel area</span><strong>417.8 ac</strong></div>
                  <div><span>Pasture cover</span><strong>78%</strong></div>
                  <div><span>Average slope</span><strong>6.2%</strong></div>
                  <div><span>Soil</span><strong>Clay loam</strong></div>
                  <div><span>Water crossings</span><strong>2</strong></div>
                </div>
              </div>
            </section>

            <section className="config-column">
              <div className="panel-heading">
                <span className="section-number">02</span>
                <div>
                  <p className="eyebrow">Plan the fence</p>
                  <h2>What are we building?</h2>
                </div>
              </div>

              <fieldset className="choice-group">
                <legend>Fence route</legend>
                <div className="route-grid">
                  {routeChoices.map((item) => (
                    <button
                      key={item.id}
                      className={routeId === item.id ? "choice active" : "choice"}
                      onClick={() => setRouteId(item.id)}
                      aria-pressed={routeId === item.id}
                    >
                      <span className="radio-dot" />
                      <strong>{item.name}</strong>
                      <small>{item.note}</small>
                      <b>{item.feet.toLocaleString()} ft</b>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="choice-group">
                <legend>Fence system</legend>
                <div className="stacked-choices">
                  {fenceChoices.map((item) => (
                    <button
                      key={item.id}
                      className={fenceId === item.id ? "choice active" : "choice"}
                      onClick={() => setFenceId(item.id)}
                      aria-pressed={fenceId === item.id}
                    >
                      <span className="radio-dot" />
                      <span><strong>{item.name}</strong><small>{item.detail}</small></span>
                      <b>{money.format(item.material + item.labor)}<small>/ ft base</small></b>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="details-row">
                <fieldset className="choice-group compact">
                  <legend>Site conditions</legend>
                  <select value={terrainId} onChange={(event) => setTerrainId(event.target.value as typeof terrainId)} aria-label="Site conditions">
                    {terrainChoices.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.detail}</option>)}
                  </select>
                </fieldset>
                <fieldset className="choice-group compact">
                  <legend>Gates</legend>
                  <div className="stepper-input">
                    <button onClick={() => setGates(Math.max(0, gates - 1))} aria-label="Remove one gate">−</button>
                    <strong>{gates}</strong>
                    <button onClick={() => setGates(Math.min(12, gates + 1))} aria-label="Add one gate">+</button>
                  </div>
                </fieldset>
              </div>

              <button className="primary-action" onClick={createEstimate}>
                Build my estimate <Chevron />
              </button>
            </section>

            <aside className={`estimate-card ${step === 3 ? "complete" : ""}`}>
              <div className="estimate-head">
                <span>{step === 3 ? "Estimate ready" : "Live estimate"}</span>
                <i />
              </div>
              <p>{route.feet.toLocaleString()} linear feet</p>
              <h3>{money.format(estimate.low)} <span>–</span><br />{money.format(estimate.high)}</h3>
              <small>Planning range before site verification</small>

              <div className="mini-takeoff">
                <div><span>Line + brace posts</span><strong>{estimate.posts.toLocaleString()}</strong></div>
                <div><span>{fence.id === "woven" || fence.id === "game" ? "Fence rolls" : "Wire rolls"}</span><strong>{estimate.rolls}</strong></div>
                <div><span>Brace assemblies</span><strong>{estimate.braces}</strong></div>
                <div><span>Estimated crew time</span><strong>{estimate.days} days</strong></div>
              </div>

              {step === 3 && (
                <>
                  <div className="cost-lines">
                    <div><span>Materials</span><strong>{money.format(estimate.material + estimate.gatesCost)}</strong></div>
                    <div><span>Installation labor</span><strong>{money.format(estimate.labor)}</strong></div>
                    <div><span>Terrain adjustment</span><strong>{money.format(estimate.siteConditions)}</strong></div>
                    <div><span>Mobilization</span><strong>{money.format(estimate.mobilization)}</strong></div>
                    <div className="total-line"><span>Suggested price</span><strong>{money.format(estimate.total)}</strong></div>
                  </div>
                  <button className="proposal-button" onClick={() => setProposalOpen(true)}>Create proposal <Chevron /></button>
                </>
              )}
              {step === 2 && <p className="estimate-tip">Adjust the plan and the numbers update instantly.</p>}
            </aside>
          </div>
        )}

        <footer className="app-footer">
          <p>Parcel boundaries are for planning and estimating—not a legal survey.</p>
          <div><span>Regrid-ready</span><span>USDA-ready</span><span>AI-ready</span></div>
        </footer>
      </section>

      {proposalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setProposalOpen(false)}>
          <section className="proposal-modal" role="dialog" aria-modal="true" aria-labelledby="proposal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setProposalOpen(false)} aria-label="Close proposal">×</button>
            <p className="eyebrow">RanchLine proposal</p>
            <h2 id="proposal-title">Circle B Ranch</h2>
            <p className="proposal-address">1427 County Road 418 · Hico, Texas</p>
            <div className="proposal-summary">
              <div><span>Scope</span><strong>{route.name}</strong></div>
              <div><span>Fence</span><strong>{fence.name}</strong></div>
              <div><span>Length</span><strong>{route.feet.toLocaleString()} ft</strong></div>
              <div><span>Gates</span><strong>{gates}</strong></div>
            </div>
            <div className="proposal-price">
              <span>Proposed investment</span>
              <strong>{money.format(estimate.total)}</strong>
              <small>Final price subject to boundary and site verification.</small>
            </div>
            <div className="proposal-actions">
              <button className="quiet-button" onClick={() => setProposalOpen(false)}>Keep editing</button>
              <button className="primary-action" onClick={() => window.print()}>Print or save PDF</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
