export type LandAnalysisInput = {
  latitude: number;
  longitude: number;
  parcelId?: string;
};

export type LandSource = {
  id: string;
  label: string;
  category: "elevation" | "water" | "soil" | "cover" | "risk";
  status: "live" | "configured" | "unavailable";
  url: string;
  note: string;
};

const SOURCES: Omit<LandSource, "status">[] = [
  {
    id: "usgs-3dep",
    label: "USGS 3DEP elevation",
    category: "elevation",
    url: "https://www.usgs.gov/the-national-map-data-delivery/gis-data-download",
    note: "Elevation is interpolated planning data, not a survey.",
  },
  {
    id: "usgs-3dhp",
    label: "USGS water & hydrography",
    category: "water",
    url: "https://3dhp.usgs.gov/arcgis/rest/services/usgs_3dhp_all/FeatureServer",
    note: "Ponds, streams and drainage features require field verification.",
  },
  {
    id: "usda-ssurgo",
    label: "USDA NRCS soils",
    category: "soil",
    url: "https://sdmdataaccess.nrcs.usda.gov/",
    note: "Soil conditions can vary within a parcel.",
  },
  {
    id: "usda-cdl",
    label: "USDA land cover",
    category: "cover",
    url: "https://www.nass.usda.gov/Research_and_Science/Cropland/",
    note: "Land-cover classification is a planning aid.",
  },
  {
    id: "fema-nfhl",
    label: "FEMA flood screening",
    category: "risk",
    url: "https://msc.fema.gov/portal/home",
    note: "Not a flood determination, permit decision, or insurance record.",
  },
  {
    id: "usfws-nwi",
    label: "USFWS wetlands screening",
    category: "risk",
    url: "https://www.fws.gov/program/national-wetlands-inventory/web-mapping-services",
    note: "Not a wetland delineation or permit determination.",
  },
];

type EpqsResponse = { value?: number; elevation?: number };

async function elevationAt(latitude: number, longitude: number) {
  const params = new URLSearchParams({
    x: String(longitude),
    y: String(latitude),
    units: "Feet",
    output: "json",
  });
  const response = await fetch(`https://epqs.nationalmap.gov/v1/json?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`EPQS returned ${response.status}`);
  const data = await response.json() as EpqsResponse;
  const value = Number(data.value ?? data.elevation);
  if (!Number.isFinite(value)) throw new Error("EPQS did not return an elevation");
  return value;
}

function metersBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const latitudeScale = 111_320;
  const longitudeScale = latitudeScale * Math.cos(((a.latitude + b.latitude) / 2) * Math.PI / 180);
  return Math.hypot((a.latitude - b.latitude) * latitudeScale, (a.longitude - b.longitude) * longitudeScale);
}

/**
 * Public-layer adapter. Keep calls server-side so public GIS providers are not
 * hit directly from browsers and so results can later be cached per parcel.
 */
export async function analyzeLand(input: LandAnalysisInput) {
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    throw new Error("A valid latitude and longitude are required.");
  }

  let elevationFeet: number | null = null;
  let profile: number[] = [];
  let elevationRange: { lowFeet: number; highFeet: number; reliefFeet: number; estimatedMaxGrade: number } | null = null;
  let elevationStatus: LandSource["status"] = "unavailable";
  try {
    const offsets = [-0.0012, 0, 0.0012];
    const points = offsets.flatMap((latitudeOffset) => offsets.map((longitudeOffset) => ({
      latitude: input.latitude + latitudeOffset,
      longitude: input.longitude + longitudeOffset,
    })));
    const values = await Promise.all(points.map((point) => elevationAt(point.latitude, point.longitude)));
    elevationFeet = values[4];
    profile = values;
    const lowFeet = Math.min(...values);
    const highFeet = Math.max(...values);
    const diagonalMeters = metersBetween(points[0], points[8]);
    elevationRange = {
      lowFeet,
      highFeet,
      reliefFeet: highFeet - lowFeet,
      estimatedMaxGrade: diagonalMeters ? ((highFeet - lowFeet) * 0.3048 / diagonalMeters) * 100 : 0,
    };
    elevationStatus = "live";
  } catch {
    // Other public layers are deliberately reported as configured until their
    // parcel/AOI queries are implemented with the selected parcel geometry.
  }

  const sources: LandSource[] = SOURCES.map((source) => ({
    ...source,
    status: source.id === "usgs-3dep" ? elevationStatus : "configured",
  }));

  return {
    parcelId: input.parcelId ?? null,
    coordinate: { latitude: input.latitude, longitude: input.longitude },
    generatedAt: new Date().toISOString(),
    terrain: {
      elevationFeet,
      elevationRange,
      profile,
      status: elevationFeet === null ? "Elevation service unavailable; retry before relying on terrain data." : "Point elevation returned from USGS 3DEP.",
      disclaimer: "Planning estimate only. Elevations are interpolated and are not a boundary, engineering, or construction survey.",
    },
    constructionSafety: {
      utilityNotice: "Before excavating, installing posts, clearing, trenching, or operating ground-engaging equipment, contact 811 and wait for all utility responses.",
      requiredAcknowledgement: true,
      estimateOnly: true,
    },
    sources,
    disclaimers: [
      "Public GIS layers are screening information only and can be incomplete or out of date.",
      "Verify parcel boundaries, access, water crossings, soils, flood and wetlands conditions in the field before construction.",
      "RANCHLINE does not locate underground utilities or replace 811, a survey, permit review, or professional site assessment.",
    ],
  };
}
