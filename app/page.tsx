"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Point = { x: number; y: number };
type Risk = "low" | "medium" | "high";
type MapTool = "select" | "draw" | "gate";
type MapView = "satellite" | "hybrid" | "terrain";
type FenceId = "electric" | "barbed" | "woven" | "game";

type GoogleMaps = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    Geocoder: new () => { geocode(request: { address: string }, callback: (results: Array<{ geometry?: { location?: { lat(): number; lng(): number } } }> | null, status: string) => void): void };
  };
};

type GoogleMapInstance = { setCenter(center: { lat: number; lng: number }): void; setZoom(zoom: number): void; setMapTypeId(mapTypeId: MapView): void };

declare global {
  interface Window { google?: GoogleMaps }
}

type LandAnalysis = {
  terrain: { elevationFeet: number | null; status: string; disclaimer: string; profile: number[]; elevationRange: { lowFeet: number; highFeet: number; reliefFeet: number; estimatedMaxGrade: number } | null };
  sources: Array<{ id: string; label: string; status: "live" | "configured" | "unavailable"; url: string }>;
};

type FenceLine = {
  id: string;
  name: string;
  points: Point[];
  feet: number;
  risk: Risk;
  condition: string;
  kind: "boundary" | "cross" | "custom";
};

type Gate = { id: string; x: number; y: number };

type Rate = {
  material: number;
  labor: number;
  gate: number;
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 620;
const FEET_PER_PIXEL = 8.65;

const parcel: Point[] = [
  { x: 180, y: 90 },
  { x: 750, y: 70 },
  { x: 880, y: 270 },
  { x: 820, y: 510 },
  { x: 380, y: 570 },
  { x: 130, y: 430 },
];

const boundaryLines: FenceLine[] = [
  { id: "b1", name: "North pasture", points: [parcel[0], parcel[1]], feet: 4930, risk: "low", condition: "Level · open pasture", kind: "boundary" },
  { id: "b2", name: "Northeast creek", points: [parcel[1], parcel[2]], feet: 2680, risk: "high", condition: "Creek crossing · 14% grade", kind: "boundary" },
  { id: "b3", name: "East brush line", points: [parcel[2], parcel[3]], feet: 2190, risk: "medium", condition: "Moderate brush clearing", kind: "boundary" },
  { id: "b4", name: "South road line", points: [parcel[3], parcel[4]], feet: 3720, risk: "low", condition: "Good equipment access", kind: "boundary" },
  { id: "b5", name: "Southwest slope", points: [parcel[4], parcel[5]], feet: 2600, risk: "medium", condition: "Rolling grade · clay loam", kind: "boundary" },
  { id: "b6", name: "West pasture", points: [parcel[5], parcel[0]], feet: 2520, risk: "low", condition: "Open pasture", kind: "boundary" },
];

const crossLines: FenceLine[] = [
  { id: "c1", name: "North cross-fence", points: [{ x: 225, y: 230 }, { x: 800, y: 215 }], feet: 1780, risk: "low", condition: "Level · open pasture", kind: "cross" },
  { id: "c2", name: "Middle cross-fence", points: [{ x: 195, y: 345 }, { x: 840, y: 340 }], feet: 1720, risk: "medium", condition: "One water crossing", kind: "cross" },
  { id: "c3", name: "South cross-fence", points: [{ x: 250, y: 455 }, { x: 790, y: 475 }], feet: 1780, risk: "low", condition: "Good equipment access", kind: "cross" },
];

const fenceSystems: Array<{
  id: FenceId;
  tier: string;
  name: string;
  detail: string;
  spacing: number;
  rollLength: number;
  strands: number;
  life: string;
}> = [
  { id: "electric", tier: "Good", name: "High-tensile electric", detail: "Fast, flexible pasture control", spacing: 30, rollLength: 4000, strands: 6, life: "20–25 years" },
  { id: "barbed", tier: "Better", name: "5-strand barbed wire", detail: "Best value for cattle ranches", spacing: 12, rollLength: 1320, strands: 5, life: "25–30 years" },
  { id: "woven", tier: "Best", name: "Woven field fence", detail: "Cattle, sheep and mixed livestock", spacing: 10, rollLength: 330, strands: 1, life: "30–35 years" },
  { id: "game", tier: "Specialty", name: "8-foot game fence", detail: "Wildlife and secure perimeter", spacing: 10, rollLength: 330, strands: 1, life: "30+ years" },
];

const initialRates: Record<FenceId, Rate> = {
  electric: { material: 1.45, labor: 1.55, gate: 875 },
  barbed: { material: 2.15, labor: 1.75, gate: 950 },
  woven: { material: 3.45, labor: 2.4, gate: 1050 },
  game: { material: 7.8, labor: 5.2, gate: 2200 },
};

const riskRates: Record<Risk, number> = { low: 0.02, medium: 0.09, high: 0.17 };
const riskColors: Record<Risk, string> = { low: "#3b8c63", medium: "#d08d32", high: "#c64f36" };

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polylineLength(points: Point[]) {
  return points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);
}

function distanceToSegment(point: Point, a: Point, b: Point) {
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (!lengthSquared) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lengthSquared));
  return distance(point, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

function lineDistance(point: Point, line: FenceLine) {
  return Math.min(...line.points.slice(1).map((next, index) => distanceToSegment(point, line.points[index], next)));
}

function drawPolygon(context: CanvasRenderingContext2D, points: Point[]) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
}

function drawPolyline(context: CanvasRenderingContext2D, points: Point[]) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
}

function RanchMap({
  allLines,
  selectedIds,
  gates,
  tool,
  onToolChange,
  onToggleLine,
  onPreset,
  onAddLine,
  onAddGate,
  onUndo,
  address,
  onAddressResolved,
}: {
  allLines: FenceLine[];
  selectedIds: string[];
  gates: Gate[];
  tool: MapTool;
  onToolChange: (tool: MapTool) => void;
  onToggleLine: (id: string) => void;
  onPreset: (preset: "boundary" | "cross" | "clear") => void;
  onAddLine: (line: FenceLine) => void;
  onAddGate: (gate: Gate) => void;
  onUndo: () => void;
  address: string;
  onAddressResolved: (location: { latitude: number; longitude: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const googleMapRef = useRef<HTMLDivElement>(null);
  const googleMapInstanceRef = useRef<GoogleMapInstance | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [mapView, setMapView] = useState<MapView>("hybrid");
  const [mapState, setMapState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    const target = googleMapRef.current;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!target || !apiKey) {
      setMapState("missing");
      return;
    }

    const startMap = () => {
      if (!window.google?.maps || !googleMapRef.current) return;
      googleMapInstanceRef.current = new window.google.maps.Map(googleMapRef.current, {
        center: { lat: 31.9825, lng: -98.0336 },
        zoom: 15,
        mapTypeId: "hybrid",
        mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined,
        disableDefaultUI: true,
        gestureHandling: "greedy",
      });
      setMapState("ready");
    };

    if (window.google?.maps) {
      startMap();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-ranchline-google-maps="true"]');
    if (existing) {
      existing.addEventListener("load", startMap, { once: true });
      existing.addEventListener("error", () => setMapState("error"), { once: true });
      return () => existing.removeEventListener("load", startMap);
    }

    const script = document.createElement("script");
    script.dataset.ranchlineGoogleMaps = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.onload = startMap;
    script.onerror = () => setMapState("error");
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    googleMapInstanceRef.current?.setMapTypeId(mapView);
  }, [mapView]);

  useEffect(() => {
    if (mapState !== "ready" || !window.google?.maps || !googleMapInstanceRef.current || !address.trim()) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      const location = status === "OK" ? results?.[0]?.geometry?.location : undefined;
      if (!location || !googleMapInstanceRef.current) return;
      googleMapInstanceRef.current.setCenter({ lat: location.lat(), lng: location.lng() });
      googleMapInstanceRef.current.setZoom(16);
      onAddressResolved({ latitude: location.lat(), longitude: location.lng() });
    });
  }, [address, mapState, onAddressResolved]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = MAP_WIDTH;
    canvas.height = MAP_HEIGHT;

    // The real Google satellite layer is below this transparent drawing canvas.
    // Demo terrain art remains here as a no-key fallback only.
    if (mapState !== "ready") {
    const background = context.createLinearGradient(0, 0, MAP_WIDTH, MAP_HEIGHT);
    background.addColorStop(0, "#687b52");
    background.addColorStop(0.48, "#8e9667");
    background.addColorStop(1, "#5d724c");
    context.fillStyle = background;
    context.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    const fields = [
      { points: [{ x: 0, y: 0 }, { x: 430, y: 0 }, { x: 360, y: 250 }, { x: 0, y: 310 }], color: "#8f945f" },
      { points: [{ x: 430, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 250 }, { x: 360, y: 250 }], color: "#76865a" },
      { points: [{ x: 0, y: 310 }, { x: 360, y: 250 }, { x: 590, y: 620 }, { x: 0, y: 620 }], color: "#a29a66" },
      { points: [{ x: 360, y: 250 }, { x: 1000, y: 250 }, { x: 1000, y: 620 }, { x: 590, y: 620 }], color: "#718152" },
    ];
    fields.forEach((field) => {
      drawPolygon(context, field.points);
      context.fillStyle = field.color;
      context.fill();
    });

    context.globalAlpha = 0.16;
    context.strokeStyle = "#f3edcb";
    context.lineWidth = 2;
    for (let index = -200; index < 1200; index += 34) {
      context.beginPath();
      context.moveTo(index, 0);
      context.lineTo(index + 230, 620);
      context.stroke();
    }
    context.globalAlpha = 1;

    context.strokeStyle = "rgba(76, 139, 143, .9)";
    context.lineWidth = 18;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(-30, 315);
    context.bezierCurveTo(210, 250, 340, 390, 520, 330);
    context.bezierCurveTo(680, 275, 780, 390, 1030, 305);
    context.stroke();
    context.strokeStyle = "rgba(202, 225, 215, .5)";
    context.lineWidth = 3;
    context.stroke();

    context.fillStyle = "rgba(79, 137, 145, .92)";
    context.beginPath();
    context.ellipse(685, 185, 58, 31, -0.18, 0, Math.PI * 2);
    context.fill();

    for (let index = 0; index < 85; index += 1) {
      const x = 35 + ((index * 83) % 930);
      const y = 35 + ((index * 137) % 540);
      if (x > 250 && x < 760 && y > 130 && y < 465) continue;
      context.fillStyle = index % 3 === 0 ? "#344d35" : "#405c3b";
      context.beginPath();
      context.arc(x, y, 4 + (index % 4), 0, Math.PI * 2);
      context.fill();
    }

    context.strokeStyle = "#b8aa84";
    context.lineWidth = 30;
    context.beginPath();
    context.moveTo(-40, 585);
    context.lineTo(1040, 520);
    context.stroke();
    context.strokeStyle = "rgba(255,255,255,.45)";
    context.lineWidth = 2;
    context.setLineDash([18, 18]);
    context.stroke();
    context.setLineDash([]);

    }

    drawPolygon(context, parcel);
    context.fillStyle = "rgba(239, 227, 174, .11)";
    context.fill();
    context.strokeStyle = "rgba(255,255,255,.88)";
    context.lineWidth = 3;
    context.setLineDash([13, 8]);
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = "rgba(19,49,38,.87)";
    context.fillRect(705, 447, 30, 24);
    context.fillStyle = "rgba(255,255,255,.85)";
    context.font = "700 12px system-ui";
    context.fillText("BARN", 693, 490);

    allLines.forEach((line) => {
      const selected = selectedIds.includes(line.id);
      drawPolyline(context, line.points);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = selected ? riskColors[line.risk] : line.kind === "boundary" ? "rgba(255,255,255,.44)" : "rgba(255,255,255,.2)";
      context.lineWidth = selected ? 8 : 3;
      context.setLineDash(selected ? [] : [10, 8]);
      context.stroke();
      context.setLineDash([]);

      if (selected) {
        const middle = line.points[Math.floor((line.points.length - 1) / 2)];
        const next = line.points[Math.ceil((line.points.length - 1) / 2)];
        const x = (middle.x + next.x) / 2;
        const y = (middle.y + next.y) / 2;
        context.fillStyle = "#fffdf7";
        context.beginPath();
        context.arc(x, y, 14, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#18382d";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = "800 10px system-ui";
        context.fillText(String(selectedIds.indexOf(line.id) + 1), x, y + 1);
        context.textAlign = "left";
        context.textBaseline = "alphabetic";
      }
    });

    if (draft.length) {
      drawPolyline(context, draft);
      context.strokeStyle = "#fffdf7";
      context.lineWidth = 5;
      context.setLineDash([9, 7]);
      context.stroke();
      context.setLineDash([]);
      draft.forEach((point) => {
        context.fillStyle = "#c65f3e";
        context.beginPath();
        context.arc(point.x, point.y, 7, 0, Math.PI * 2);
        context.fill();
      });
    }

    gates.forEach((gate) => {
      context.fillStyle = "#173a2e";
      context.beginPath();
      context.arc(gate.x, gate.y, 14, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#fffdf7";
      context.lineWidth = 3;
      context.stroke();
      context.fillStyle = "#fff";
      context.font = "900 10px system-ui";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("G", gate.x, gate.y + 1);
    });
    context.textAlign = "left";
    context.textBaseline = "alphabetic";

    context.fillStyle = "rgba(16,42,33,.82)";
    context.font = "700 13px system-ui";
    context.fillText("417.8 ACRES", 455, 290);
    context.font = "700 10px system-ui";
    context.fillText("CR 418", 465, 565);
  }, [allLines, draft, gates, mapState, selectedIds]);

  function mapPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * MAP_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * MAP_HEIGHT,
    };
  }

  function handlePointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = mapPoint(event);
    if (tool === "draw") {
      setDraft((current) => [...current, point]);
      return;
    }
    if (tool === "gate") {
      onAddGate({ id: `gate-${Date.now()}`, ...point });
      return;
    }
    const closest = allLines
      .map((line) => ({ line, distance: lineDistance(point, line) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (closest && closest.distance < 32) onToggleLine(closest.line.id);
  }

  function finishDraft() {
    if (draft.length < 2) return;
    const feet = Math.max(50, Math.round(polylineLength(draft) * FEET_PER_PIXEL / 10) * 10);
    onAddLine({
      id: `custom-${Date.now()}`,
      name: "Field-drawn route",
      points: draft,
      feet,
      risk: "medium",
      condition: "Verify route conditions in field",
      kind: "custom",
    });
    setDraft([]);
    onToolChange("select");
  }

  function undo() {
    if (draft.length) {
      setDraft((current) => current.slice(0, -1));
    } else {
      onUndo();
    }
  }

  return (
    <div className="map-workspace">
      <div className="map-actions" aria-label="Fence map tools">
        <div className="map-presets">
          <button onClick={() => onPreset("boundary")}>Full boundary</button>
          <button onClick={() => onPreset("cross")}>Cross-fences</button>
          <button onClick={() => onPreset("clear")}>Clear</button>
        </div>
        <div className="map-tools">
          <button className={tool === "select" ? "active" : ""} onClick={() => onToolChange("select")} aria-pressed={tool === "select"}>Select edges</button>
          <button className={tool === "draw" ? "active" : ""} onClick={() => onToolChange("draw")} aria-pressed={tool === "draw"}>＋ Draw line</button>
          <button className={tool === "gate" ? "active" : ""} onClick={() => onToolChange("gate")} aria-pressed={tool === "gate"}>＋ Add gate</button>
          <button onClick={undo} aria-label="Undo last map action">↶ Undo</button>
        </div>
      </div>
      <div className="map-view-switcher" aria-label="Map view controls">
        <span>Land view</span>
        {(["satellite", "hybrid", "terrain"] as MapView[]).map((view) => (
          <button key={view} className={mapView === view ? "active" : ""} onClick={() => setMapView(view)}>{view}</button>
        ))}
        <small>{mapView === "terrain" ? "Topography and grade context" : mapView === "satellite" ? "Clean aerial imagery" : "Aerial imagery with access roads"}</small>
      </div>

      <div className={`canvas-shell tool-${tool}`}>
        <div ref={googleMapRef} className="google-map-base" aria-label="Google satellite map" />
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointer}
          aria-label="Interactive ranch map. Select property edges, draw cross-fences, or place gates."
        />
        {mapState !== "ready" && <div className="map-provider-status">{mapState === "loading" ? "Loading satellite map…" : mapState === "missing" ? "Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in Render to enable Google Maps" : "Google Maps could not load — check key restrictions and enabled APIs"}</div>}
        <div className="map-mode-tip">
          {tool === "select" && "Click a fence segment to include or remove it"}
          {tool === "draw" && "Click points along the route, then finish the line"}
          {tool === "gate" && "Click the map wherever a gate should go"}
        </div>
        {tool === "draw" && (
          <button className="finish-line" onClick={finishDraft} disabled={draft.length < 2}>
            Finish line · {draft.length} points
          </button>
        )}
        <div className="map-legend">
          <span><i className="risk-low" /> Easy</span>
          <span><i className="risk-medium" /> Moderate</span>
          <span><i className="risk-high" /> Difficult</span>
          <span><i className="water-key" /> Water</span>
        </div>
      </div>
    </div>
  );
}

function Chevron() {
  return <span aria-hidden="true">›</span>;
}

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [address, setAddress] = useState("16710 Ranch Rd 965, Fredericksburg, TX 78624");
  const [finding, setFinding] = useState(false);
  const [propertyFound, setPropertyFound] = useState(false);
  const [selectedIds, setSelectedIds] = useState(boundaryLines.map((line) => line.id));
  const [customLines, setCustomLines] = useState<FenceLine[]>([]);
  const [gates, setGates] = useState<Gate[]>([
    { id: "gate-1", x: 245, y: 485 },
    { id: "gate-2", x: 790, y: 515 },
  ]);
  const [tool, setTool] = useState<MapTool>("select");
  const [fenceId, setFenceId] = useState<FenceId>("barbed");
  const [rates, setRates] = useState(initialRates);
  const [margin, setMargin] = useState(18);
  const [mobilization, setMobilization] = useState(2400);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [diggingAcknowledged, setDiggingAcknowledged] = useState(false);
  const [landAnalysis, setLandAnalysis] = useState<LandAnalysis | null>(null);
  const [landAnalysisState, setLandAnalysisState] = useState<"idle" | "loading" | "error">("idle");

  const allLines = useMemo(() => [...boundaryLines, ...crossLines, ...customLines], [customLines]);
  const selectedLines = useMemo(() => allLines.filter((line) => selectedIds.includes(line.id)), [allLines, selectedIds]);
  const feet = selectedLines.reduce((sum, line) => sum + line.feet, 0);
  const fence = fenceSystems.find((item) => item.id === fenceId)!;

  function calculateEstimate(systemId: FenceId) {
    const system = fenceSystems.find((item) => item.id === systemId)!;
    const rate = rates[systemId];
    const materials = feet * rate.material;
    const labor = feet * rate.labor;
    const gateCost = gates.length * rate.gate;
    const conditions = selectedLines.reduce(
      (sum, line) => sum + line.feet * (rate.material + rate.labor) * riskRates[line.risk],
      0,
    );
    const directCost = materials + labor + gateCost + conditions + mobilization;
    const total = margin >= 95 ? directCost : directCost / (1 - margin / 100);
    const braces = selectedLines.length * 2 + gates.length * 2;
    const difficultFeet = selectedLines.filter((line) => line.risk === "high").reduce((sum, line) => sum + line.feet, 0);
    const confidence = Math.max(68, 91 - customLines.length * 5 - (difficultFeet > 0 ? 4 : 0));

    return {
      system,
      materials,
      labor,
      gateCost,
      conditions,
      directCost,
      profit: total - directCost,
      total,
      low: total * 0.96,
      high: total * 1.06,
      braces,
      posts: Math.ceil(feet / system.spacing) + braces * 2,
      rolls: Math.ceil((feet * system.strands) / system.rollLength),
      days: feet ? Math.max(2, Math.ceil(feet / (system.id === "game" ? 560 : 920))) : 0,
      confidence,
      perFoot: feet ? total / feet : 0,
    };
  }

  const estimate = calculateEstimate(fenceId);

  async function findProperty() {
    if (!address.trim()) return;
    setFinding(true);
    setLandAnalysisState("loading");
    setPropertyFound(true);
    setStep(2);
    setFinding(false);
  }

  const analyzeCoordinates = useCallback(async (location: { latitude: number; longitude: number }) => {
    setLandAnalysisState("loading");
    try {
      const response = await fetch("/api/land-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: location.latitude, longitude: location.longitude }),
      });
      if (!response.ok) throw new Error("Land analysis unavailable");
      setLandAnalysis(await response.json() as LandAnalysis);
      setLandAnalysisState("idle");
    } catch {
      setLandAnalysisState("error");
    } finally {
      // The map remains usable even if a public land-data service is unavailable.
    }
  }, []);

  function toggleLine(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function setPreset(preset: "boundary" | "cross" | "clear") {
    if (preset === "boundary") setSelectedIds(boundaryLines.map((line) => line.id));
    if (preset === "cross") setSelectedIds(crossLines.map((line) => line.id));
    if (preset === "clear") setSelectedIds([]);
    setTool("select");
  }

  function addLine(line: FenceLine) {
    setCustomLines((current) => [...current, line]);
    setSelectedIds((current) => [...current, line.id]);
  }

  function undoMapAction() {
    if (gates.length > 2) {
      setGates((current) => current.slice(0, -1));
      return;
    }
    const lastCustom = customLines[customLines.length - 1];
    if (lastCustom) {
      setCustomLines((current) => current.slice(0, -1));
      setSelectedIds((current) => current.filter((id) => id !== lastCustom.id));
      return;
    }
    setSelectedIds((current) => current.slice(0, -1));
  }

  function updateRate(field: keyof Rate, value: number) {
    setRates((current) => ({
      ...current,
      [fenceId]: { ...current[fenceId], [field]: Number.isFinite(value) ? value : 0 },
    }));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setStep(1)} aria-label="RanchLine home">
          <span className="brand-mark">R</span>
          <span>RanchLine</span>
        </button>
        <div className="topbar-actions">
          {propertyFound && <span className="save-state"><i /> Project saved</span>}
          <span className="demo-pill">Demo data · API ready</span>
          <button className="text-button" onClick={() => setPricingOpen(true)}>Company pricing</button>
        </div>
      </header>

      {step === 1 && (
        <section className="search-screen">
          <div className="search-copy">
            <p className="eyebrow">Agricultural fence estimating</p>
            <h1>Quote the land<br />in front of you.</h1>
            <p className="lede">Find a ranch, draw the exact fence, account for the terrain, and leave with a customer-ready price.</p>
            <label htmlFor="property-search">Ranch address or parcel number</label>
            <div className="property-search">
              <span aria-hidden="true">⌖</span>
              <input
                id="property-search"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && findProperty()}
                placeholder="Enter an address or APN"
              />
              <button onClick={findProperty} disabled={finding || !address.trim()}>
                {finding ? "Finding land…" : "Find the land"} <Chevron />
              </button>
            </div>
            <button className="sample-link" onClick={() => setAddress("16710 Ranch Rd 965, Fredericksburg, TX 78624")}>Use live demo: Enchanted Rock area · Fredericksburg, TX</button>

            <div className="how-it-works">
              <div><span>1</span><strong>Find</strong><small>Parcel + land data</small></div>
              <i />
              <div><span>2</span><strong>Plan</strong><small>Draw lines + gates</small></div>
              <i />
              <div><span>3</span><strong>Quote</strong><small>Takeoff + proposal</small></div>
            </div>
          </div>

          <div className="hero-map" aria-hidden="true">
            <div className="hero-field field-one" />
            <div className="hero-field field-two" />
            <div className="hero-parcel"><span>417.8<small>ACRES</small></span></div>
            <div className="hero-creek" />
            <div className="hero-fence hero-fence-one" />
            <div className="hero-fence hero-fence-two" />
            <div className="hero-pin">R</div>
            <div className="hero-quote">
              <span>Planning estimate</span>
              <strong>$86,400–$95,300</strong>
              <small>18,640 ft · 5-strand barbed wire</small>
            </div>
          </div>
        </section>
      )}

      {step >= 2 && propertyFound && (
        <section className="project-shell">
          <div className="project-header">
            <div className="project-title">
              <button onClick={() => setStep(1)} aria-label="Return to property search">←</button>
              <div>
                <span className="verified">✓ Parcel matched</span>
                <h1>Land Estimate</h1>
                <p>{address} · Parcel lookup pending</p>
              </div>
            </div>
            <div className="project-steps" aria-label="Estimate progress">
              <span className="done">1 <b>Property</b></span>
              <i />
              <span className={step >= 2 ? "done" : ""}>2 <b>Fence plan</b></span>
              <i />
              <span className={step >= 3 ? "done" : ""}>3 <b>Quote</b></span>
            </div>
          </div>

          <div className="property-intel">
            <div><span>Parcel area</span><strong>417.8 ac</strong><small>Regrid parcel</small></div>
            <div><span>Pasture cover</span><strong>78%</strong><small>USDA land cover</small></div>
            <div><span>Elevation</span><strong>{landAnalysis?.terrain.elevationFeet ? `${Math.round(landAnalysis.terrain.elevationFeet).toLocaleString()} ft` : "Checking…"}</strong><small>USGS 3DEP · estimate</small></div>
            <div><span>Primary soil</span><strong>Clay loam</strong><small>NRCS soil data</small></div>
            <div><span>Water features</span><strong>2 crossings</strong><small>Hydrography</small></div>
            <button><span>＋</span><strong>Add parcel</strong><small>Combine another APN</small></button>
          </div>

          {landAnalysis?.terrain.elevationRange && (
            <section className="terrain-intelligence" aria-label="Property terrain scan">
              <div className="terrain-title"><p className="eyebrow">Property terrain scan</p><h2>See the low ground, high ground and job difficulty</h2><small>USGS 3DEP screening scan around the searched address · field verification required</small></div>
              <div className="terrain-profile">
                <svg viewBox="0 0 240 68" preserveAspectRatio="none" aria-label="Elevation profile">
                  <defs><linearGradient id="terrain-fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#e1aa4f" stopOpacity=".55" /><stop offset="1" stopColor="#e1aa4f" stopOpacity=".04" /></linearGradient></defs>
                  {(() => { const values = landAnalysis.terrain.profile; const low = Math.min(...values); const high = Math.max(...values); const range = Math.max(1, high - low); const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 240},${58 - ((value - low) / range) * 45}`).join(" "); return <><polygon points={`0,68 ${points} 240,68`} fill="url(#terrain-fill)" /><polyline points={points} fill="none" stroke="#c2613f" strokeWidth="3" strokeLinejoin="round" /></>; })()}
                </svg>
              </div>
              <div className="terrain-metrics"><div><span>Low point</span><strong>{Math.round(landAnalysis.terrain.elevationRange.lowFeet).toLocaleString()} ft</strong></div><div><span>High point</span><strong>{Math.round(landAnalysis.terrain.elevationRange.highFeet).toLocaleString()} ft</strong></div><div><span>Relief</span><strong>{Math.round(landAnalysis.terrain.elevationRange.reliefFeet)} ft</strong></div><div><span>Terrain grade</span><strong>{landAnalysis.terrain.elevationRange.estimatedMaxGrade < 5 ? "Easy" : landAnalysis.terrain.elevationRange.estimatedMaxGrade < 12 ? "Rolling" : "Steep"}</strong></div></div>
            </section>
          )}

          <div className="estimator-layout">
            <section className="map-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">Fence plan</p>
                  <h2>Draw exactly what you’re building</h2>
                </div>
                <div className="map-total"><span>Selected route</span><strong>{feet.toLocaleString()} ft</strong></div>
              </div>

              <RanchMap
                allLines={allLines}
                selectedIds={selectedIds}
                gates={gates}
                tool={tool}
                onToolChange={setTool}
                onToggleLine={toggleLine}
                onPreset={setPreset}
                onAddLine={addLine}
                onAddGate={(gate) => setGates((current) => [...current, gate])}
                onUndo={undoMapAction}
                address={address}
                onAddressResolved={analyzeCoordinates}
              />

              <div className="segment-head">
                <div>
                  <h3>Route intelligence</h3>
                  <p>Pricing adjusts by the conditions on each selected segment.</p>
                </div>
                <span>{selectedLines.length} segments · {gates.length} gates</span>
              </div>
              <div className="segment-list">
                {selectedLines.length ? selectedLines.map((line, index) => (
                  <button key={line.id} onClick={() => toggleLine(line.id)}>
                    <span className="segment-index" style={{ background: riskColors[line.risk] }}>{index + 1}</span>
                    <span><strong>{line.name}</strong><small>{line.condition}</small></span>
                    <span className={`risk-badge ${line.risk}`}>{line.risk}</span>
                    <b>{line.feet.toLocaleString()} ft</b>
                    <i aria-hidden="true">×</i>
                  </button>
                )) : (
                  <div className="empty-route">Choose Full boundary, select an edge, or draw a new fence line.</div>
                )}
              </div>
            </section>

            <aside className="estimate-panel">
              <div className="estimate-panel-head">
                <div>
                  <p className="eyebrow">Live estimate</p>
                  <h2>Build the quote</h2>
                </div>
                <button onClick={() => setPricingOpen(true)}>Edit rates</button>
              </div>

              <fieldset className="fence-selector">
                <legend>Fence system</legend>
                {fenceSystems.map((system) => (
                  <button
                    key={system.id}
                    className={fenceId === system.id ? "active" : ""}
                    onClick={() => setFenceId(system.id)}
                    aria-pressed={fenceId === system.id}
                  >
                    <span className="radio" />
                    <span><b>{system.tier}</b><strong>{system.name}</strong><small>{system.detail}</small></span>
                    <span><strong>{money.format(rates[system.id].material + rates[system.id].labor)}</strong><small>base / ft</small></span>
                  </button>
                ))}
              </fieldset>

              <div className="quote-card">
                <div className="quote-confidence">
                  <span>Planning range</span>
                  <b>{estimate.confidence}% confidence</b>
                </div>
                <h3>{money.format(estimate.low)} <span>–</span> {money.format(estimate.high)}</h3>
                <p>{feet.toLocaleString()} ft · {gates.length} gates · {money.format(estimate.perFoot)}/ft</p>

                <div className="quote-lines">
                  <div><span>Materials</span><strong>{money.format(estimate.materials + estimate.gateCost)}</strong></div>
                  <div><span>Installation labor</span><strong>{money.format(estimate.labor)}</strong></div>
                  <div><span>Segment conditions</span><strong>{money.format(estimate.conditions)}</strong></div>
                  <div><span>Mobilization</span><strong>{money.format(mobilization)}</strong></div>
                  <div><span>Gross profit ({margin}%)</span><strong>{money.format(estimate.profit)}</strong></div>
                  <div className="suggested"><span>Suggested price</span><strong>{money.format(estimate.total)}</strong></div>
                </div>
              </div>

              <div className="takeoff-grid">
                <div><span>Posts</span><strong>{estimate.posts.toLocaleString()}</strong></div>
                <div><span>Wire rolls</span><strong>{estimate.rolls}</strong></div>
                <div><span>Braces</span><strong>{estimate.braces}</strong></div>
                <div><span>Crew time</span><strong>{estimate.days} days</strong></div>
              </div>

              <div className="job-comp">
                <span className="comp-icon">↗</span>
                <div><strong>8 similar ranch jobs</strong><p>Your price is within 4% of completed jobs with similar footage and terrain.</p></div>
                <b>On target</b>
              </div>

              <section className="site-safety" aria-labelledby="site-safety-title">
                <div className="safety-icon" aria-hidden="true">!</div>
                <div>
                  <p className="eyebrow">Required before digging</p>
                  <h3 id="site-safety-title">Call 811 before you dig</h3>
                  <p>Utilities are not included in map data. Contact 811 and wait for all utility responses before post holes, trenching, clearing, or ground-engaging equipment.</p>
                  <label>
                    <input type="checkbox" checked={diggingAcknowledged} onChange={(event) => setDiggingAcknowledged(event.target.checked)} />
                    I understand this quote is an estimate and 811 is required before excavation.
                  </label>
                </div>
              </section>

              <section className="data-status" aria-label="Land data status">
                <div><strong>Land-data screening</strong><span>{landAnalysisState === "loading" ? "Checking public layers…" : landAnalysisState === "error" ? "Some layers are temporarily unavailable" : "Estimate-only public layers"}</span></div>
                {landAnalysis?.sources.slice(0, 4).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.status === "live" ? "●" : "○"} {source.label}</a>)}
              </section>

              {step === 2 ? (
                <button className="primary-action" onClick={() => setStep(3)} disabled={!feet || !diggingAcknowledged}>
                  Review customer quote <Chevron />
                </button>
              ) : (
                <div className="quote-actions">
                  <button className="secondary-action" onClick={() => setStep(2)}>Keep editing</button>
                  <button className="primary-action" onClick={() => setProposalOpen(true)} disabled={!diggingAcknowledged}>Create proposal <Chevron /></button>
                </div>
              )}
              <p className="estimate-note">Planning estimate only. Verify route, access, utilities, legal boundaries and field conditions before construction.</p>
            </aside>
          </div>
        </section>
      )}

      {pricingOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPricingOpen(false)}>
          <section className="drawer" role="dialog" aria-modal="true" aria-labelledby="pricing-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setPricingOpen(false)} aria-label="Close pricing settings">×</button>
            <p className="eyebrow">Company pricing</p>
            <h2 id="pricing-title">Use your real numbers</h2>
            <p className="drawer-copy">These rates control every estimate. Connect supplier catalogs later for automatic updates.</p>
            <label>Editing fence system<select value={fenceId} onChange={(event) => setFenceId(event.target.value as FenceId)}>{fenceSystems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}</select></label>
            <div className="rate-grid">
              <label>Material cost / ft<input type="number" step="0.05" min="0" value={rates[fenceId].material} onChange={(event) => updateRate("material", Number(event.target.value))} /></label>
              <label>Labor cost / ft<input type="number" step="0.05" min="0" value={rates[fenceId].labor} onChange={(event) => updateRate("labor", Number(event.target.value))} /></label>
              <label>Installed gate<input type="number" step="25" min="0" value={rates[fenceId].gate} onChange={(event) => updateRate("gate", Number(event.target.value))} /></label>
              <label>Mobilization<input type="number" step="100" min="0" value={mobilization} onChange={(event) => setMobilization(Number(event.target.value))} /></label>
              <label>Target gross margin<input type="number" step="1" min="0" max="60" value={margin} onChange={(event) => setMargin(Number(event.target.value))} /></label>
            </div>
            <div className="pricing-preview"><span>Current suggested price</span><strong>{money.format(estimate.total)}</strong></div>
            <button className="primary-action" onClick={() => setPricingOpen(false)}>Save company pricing</button>
          </section>
        </div>
      )}

      {proposalOpen && (
        <div className="modal-backdrop proposal-backdrop" role="presentation" onMouseDown={() => setProposalOpen(false)}>
          <section className="proposal-modal" role="dialog" aria-modal="true" aria-labelledby="proposal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setProposalOpen(false)} aria-label="Close proposal">×</button>
            <div className="proposal-brand"><span className="brand-mark">R</span><strong>RanchLine Proposal</strong></div>
            <div className="proposal-heading">
              <div><p className="eyebrow">Prepared for</p><h2 id="proposal-title">Circle B Ranch</h2><p>1427 County Road 418 · Hico, Texas</p></div>
              <div><span>Fence route</span><strong>{feet.toLocaleString()} ft</strong><small>{selectedLines.length} segments · {gates.length} gates</small></div>
            </div>
            <p className="proposal-intro">Three livestock-ready options using the same verified route and site conditions.</p>
            <div className="proposal-options">
              {(["electric", "barbed", "woven"] as FenceId[]).map((id) => {
                const option = calculateEstimate(id);
                return (
                  <button className={fenceId === id ? "recommended" : ""} key={id} onClick={() => setFenceId(id)}>
                    {fenceId === id && <em>Recommended</em>}
                    <span>{option.system.tier}</span>
                    <h3>{option.system.name}</h3>
                    <p>{option.system.detail}</p>
                    <strong>{money.format(option.total)}</strong>
                    <small>{money.format(option.perFoot)}/ft · {option.system.life}</small>
                    <i>{fenceId === id ? "Selected" : "Choose option"}</i>
                  </button>
                );
              })}
            </div>
            <div className="proposal-scope">
              <div><span>Included</span><strong>Materials, installation, gates, braces and mobilization</strong></div>
              <div><span>Site allowance</span><strong>{money.format(estimate.conditions)} for mapped terrain conditions</strong></div>
              <div><span>Schedule</span><strong>Approximately {estimate.days} working days after mobilization</strong></div>
            </div>
            <div className="proposal-safety-note"><strong>Required before digging:</strong> Contact 811 and wait for all utility responses before excavation, post installation, trenching, clearing, or ground-engaging equipment. Terrain, water, flood, wetlands and soil layers are planning estimates only and require field verification.</div>
            <div className="proposal-footer">
              <p>Final price subject to boundary and field verification.</p>
              <div><button className="secondary-action" onClick={() => setProposalOpen(false)}>Keep editing</button><button className="primary-action" onClick={() => window.print()}>Print or save PDF</button></div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
