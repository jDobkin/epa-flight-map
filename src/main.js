import mapboxgl from "mapbox-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer } from "@deck.gl/layers";
import "./style.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_API || "pk.eyJ1IjoiamRvYmtpbiIsImEiOiJja3dvang3ODMwMWxxMm9wNGFxcDRjdnV1In0.isHSTiX3XD0xMVX1zPysBA";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/light-v11",
  center: [-75.2, 40],
  zoom: 9,
});

let overlay;
let ipdLayer;
let pointLayer;
let currentScoreField = "ipd_score";
let ipdData;
let flightData;

function getColorForScore(score, field) {
  if (typeof score !== "number") return [224, 224, 224];
  const blueScale = [
    [1, [239, 243, 255]],
    [2, [198, 219, 239]],
    [3, [158, 202, 225]],
    [4, [107, 174, 214]],
    [5, [33, 113, 181]],
    [6, [8, 69, 148]]
  ];
  if (field === "ipd_score") {
    if (score >= 16) return blueScale[5][1];
    if (score >= 13) return blueScale[4][1];
    if (score >= 10) return blueScale[3][1];
    if (score >= 7) return blueScale[2][1];
    if (score >= 4) return blueScale[1][1];
    if (score >= 1) return blueScale[0][1];
  } else {
    return blueScale[Math.max(0, Math.min(score, 5))][1];
  }
  return [224, 224, 224];
}

function getColorForEmissions(emissions) {
  if (emissions > 1000000) return [189, 0, 38];
  if (emissions > 500000) return [240, 59, 32];
  if (emissions > 200000) return [253, 141, 60];
  if (emissions > 100000) return [254, 178, 76];
  if (emissions > 50000) return [254, 217, 118];
  if (emissions > 10000) return [255, 237, 160];
  return [255, 255, 204];
}

function createIpdLayer(data, scoreField) {
  return new GeoJsonLayer({
    id: `ipd-fill-${scoreField}`,
    data,
    stroked: false,
    filled: true,
    opacity: 0.5,
    getFillColor: f => getColorForScore(f.properties[scoreField], scoreField),
    updateTriggers: {
      getFillColor: [scoreField]
    },
    parameters: {
      depthTest: true
    }
  });
}

function createFlightPoints(data) {
  return new GeoJsonLayer({
    id: "emissions-points",
    data,
    pickable: true,
    pointType: "circle",
    getPosition: f => {
      const coords = f?.geometry?.coordinates;
      return Array.isArray(coords) ? coords : [0, 0]; // fallback to dummy
      },
    getFillColor: f => getColorForEmissions(f.properties.emissions),
    getRadius: f => Math.sqrt(f.properties.emissions || 0) * 0.2 + 300,
    radiusUnits: "meters",
    opacity: 0.8,
    onClick: info => {
      const p = info.object?.properties;
      if (p) {
        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
          .setLngLat(info.coordinate)
          .setHTML(`
            <strong>${p.facility}</strong><br>
            ${p.city}, ${p.state}<br>
            Emissions: ${p.emissions?.toLocaleString()} MT CO₂e
          `);
        popup.addTo(map);
        popup.getElement().style.zIndex = 9999;
      }
    },
    parameters: {
      depthTest: false
    }
  });
}

map.on("load", async () => {
  // --- SPLASH SCREEN ---
  const splash = document.createElement("div");
  splash.style.position = "fixed";
  splash.style.top = "0";
  splash.style.left = "0";
  splash.style.width = "100vw";
  splash.style.height = "100vh";
  splash.style.backgroundColor = "rgba(255,255,255,0.95)";
  splash.style.display = "flex";
  splash.style.flexDirection = "column";
  splash.style.justifyContent = "center";
  splash.style.alignItems = "center";
  splash.style.zIndex = "10002";

  const splashContent = document.createElement("div");
  splashContent.innerHTML = `
    <div style="max-width: 600px; text-align: center;">
      <h2>Welcome to the EPA Flight + Philadelphia Region IPD Explorer</h2>
      <p>This map displays emissions data from EPA’s FLIGHT database alongside indicators of demographic vulnerability (IPD).</p>
      <p>This dataset is intended to be an example of the  need to a intersectional approach to addressing environmental justice.</p>
      <p>More info on DVRPC's IPD dataset methodologies can be found 
       <a href="https://github.com/dvrpc/ipd" target="_blank" rel="noopener noreferrer">here</a>.</p>
      <button id="startBtn" style="margin-top: 20px; padding: 10px 20px; font-size: 16px;">Enter Map</button>
    </div>
  `;

  splash.appendChild(splashContent);
  document.body.appendChild(splash);

  document.getElementById("startBtn").addEventListener("click", () => {
    splash.remove();
  });

  try {
    const uiContainer = document.createElement("div");
    uiContainer.style.position = "absolute";
    uiContainer.style.top = "0";
    uiContainer.style.left = "0";
    uiContainer.style.width = "100%";
    uiContainer.style.height = "100%";
    uiContainer.style.pointerEvents = "none";
    uiContainer.style.zIndex = "10001";

    const title = document.createElement("div");
    title.textContent = "EPA Flight Data and IPD Scores";
    title.style.position = "absolute";
    title.style.top = "10px";
    title.style.left = "10px";
    title.style.backgroundColor = "white";
    title.style.padding = "6px 12px";
    title.style.fontSize = "16px";
    title.style.fontWeight = "bold";
    title.style.borderRadius = "4px";
    title.style.pointerEvents = "auto";
    uiContainer.appendChild(title);

    const emissionsLegend = document.createElement("div");
    emissionsLegend.innerHTML = `
      <div style="background: white; padding: 8px; border-radius: 4px; font-size: 12px;">
        <strong>Emissions Legend</strong><br>
        <div><span style="background: rgb(189,0,38); width: 12px; height: 12px; display: inline-block;"></span> > 1,000,000</div>
        <div><span style="background: rgb(240,59,32); width: 12px; height: 12px; display: inline-block;"></span> > 500,000</div>
        <div><span style="background: rgb(253,141,60); width: 12px; height: 12px; display: inline-block;"></span> > 200,000</div>
        <div><span style="background: rgb(254,178,76); width: 12px; height: 12px; display: inline-block;"></span> > 100,000</div>
        <div><span style="background: rgb(254,217,118); width: 12px; height: 12px; display: inline-block;"></span> > 50,000</div>
        <div><span style="background: rgb(255,237,160); width: 12px; height: 12px; display: inline-block;"></span> > 10,000</div>
        <div><span style="background: rgb(255,255,204); width: 12px; height: 12px; display: inline-block;"></span> ≤ 10,000</div>
      </div>
    `;
    emissionsLegend.style.position = "absolute";
    emissionsLegend.style.bottom = "10px";
    emissionsLegend.style.left = "10px";
    emissionsLegend.style.pointerEvents = "auto";
    uiContainer.appendChild(emissionsLegend);

    const ipdLegend = document.createElement("div");
    ipdLegend.innerHTML = `
      <div style="background: white; padding: 8px; border-radius: 4px; font-size: 12px;">
        <strong>IPD Score (Blue Scale)</strong><br>
        <div><span style="background: rgb(8,69,148); width: 12px; height: 12px; display: inline-block;"></span> Well Above Average</div>
        <div><span style="background: rgb(33,113,181); width: 12px; height: 12px; display: inline-block;"></span> Above Average</div>
        <div><span style="background: rgb(107,174,214); width: 12px; height: 12px; display: inline-block;"></span> Average</div>
        <div><span style="background: rgb(158,202,225); width: 12px; height: 12px; display: inline-block;"></span> Below Average</div>
        <div><span style="background: rgb(198,219,239); width: 12px; height: 12px; display: inline-block;"></span> Well Below Average</div>
      </div>
    `;
    ipdLegend.style.position = "absolute";
    ipdLegend.style.bottom = "10px";
    ipdLegend.style.left = "180px";
    ipdLegend.style.pointerEvents = "auto";
    uiContainer.appendChild(ipdLegend);

    const dropdown = document.createElement("select");
    dropdown.style.position = "absolute";
    dropdown.style.top = "50px";
    dropdown.style.right = "10px";
    dropdown.style.pointerEvents = "auto";

    const scoreFields = [
      { value: "ipd_score", label: "IPD Score" },
      { value: "li_score", label: "Limited Income" },
      { value: "rm_score", label: "Racial Minority" },
      { value: "f_score", label: "Foreign Born" },
      { value: "fb_score", label: "Female-Headed HH" },
      { value: "d_score", label: "Disabled Population" }
    ];

    scoreFields.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      dropdown.appendChild(option);
    });

    dropdown.addEventListener("change", () => {
      currentScoreField = dropdown.value;
      ipdLayer = createIpdLayer(ipdData, currentScoreField);
      overlay.setProps({ layers: [ipdLayer, pointLayer] });
    });

    uiContainer.appendChild(dropdown);
    document.body.appendChild(uiContainer);

    const flightRes = await fetch("/flight_data_grouped.geojson");
    flightData = await flightRes.json();
    pointLayer = createFlightPoints(flightData);

    const ipdRes = await fetch("https://arcgis.dvrpc.org/portal/rest/services/demographics/ipd_2023/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson");
    ipdData = await ipdRes.json();

    ipdLayer = createIpdLayer(ipdData, currentScoreField);
    overlay = new MapboxOverlay({ layers: [ipdLayer, pointLayer] });
    map.addControl(overlay);
  } catch (err) {
    console.error("Failed to load or render data:", err);
  }
});
