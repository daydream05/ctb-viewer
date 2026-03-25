import init, { CtbFile } from "./pkg/ctb_viewer_wasm.js";
import { clearCanvas, renderPlaceholder, renderRgbaBuffer } from "./renderer.js";

const state = {
  wasmReady: false,
  ctb: null,
  metadata: null,
  pendingLayerIndex: 0,
  layerToken: 0,
};

const elements = {
  dropZone: document.querySelector("[data-drop-zone]"),
  fileInput: document.querySelector("#file-input"),
  chooseFile: document.querySelector("[data-open-picker]"),
  status: document.querySelector("[data-status]"),
  fileName: document.querySelector("[data-file-name]"),
  largePreview: document.querySelector("#large-preview"),
  smallPreview: document.querySelector("#small-preview"),
  settings: document.querySelector("[data-settings]"),
  slider: document.querySelector("#layer-slider"),
  sliderLabel: document.querySelector("[data-layer-label]"),
  sliderHint: document.querySelector("[data-layer-hint]"),
  layerCanvas: document.querySelector("#layer-canvas"),
  layerMeta: document.querySelector("[data-layer-meta]"),
  scrubberPanel: document.querySelector("[data-scrubber-panel]"),
};

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

setupUi();
boot();

async function boot() {
  setStatus("Loading parser…");
  renderPlaceholder(elements.largePreview, "WASM parser booting", "Compiling Rust in your browser");
  renderPlaceholder(elements.smallPreview, "Embedded previews", "Ready when you drop a CTB");
  renderPlaceholder(elements.layerCanvas, "Layer viewport", "White pixels match UV exposure");

  try {
    await init();
    state.wasmReady = true;
    setStatus("Drop a .ctb file or choose one from disk.");
    await loadDemo();
  } catch (error) {
    setStatus(`Failed to load the WASM parser: ${error.message}`);
  }
}

function setupUi() {
  elements.chooseFile.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", (event) => {
    const [file] = event.target.files ?? [];
    if (file) {
      handleFile(file);
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.dataset.state = "hover";
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (eventName !== "drop") {
        elements.dropZone.dataset.state = "idle";
      }
    });
  });

  elements.dropZone.addEventListener("drop", (event) => {
    elements.dropZone.dataset.state = "idle";
    const [file] = event.dataTransfer?.files ?? [];
    if (file) {
      handleFile(file);
    }
  });

  elements.slider.addEventListener("input", () => {
    const index = Number(elements.slider.value);
    updateLayerLabels(index);
    queueLayerRender(index);
  });

  window.addEventListener("resize", () => {
    if (!state.ctb || !state.metadata) {
      return;
    }

    renderPreviews();
    queueLayerRender(Number(elements.slider.value));
  });
}

async function handleFile(file) {
  if (!state.wasmReady) {
    setStatus("The parser is still loading. Try again in a moment.");
    return;
  }

  state.ctb?.free?.();
  state.ctb = null;
  state.metadata = null;
  elements.fileName.textContent = file.name;
  setStatus(`Reading ${file.name}…`);
  elements.dropZone.dataset.state = "busy";

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    state.ctb = CtbFile.parse(bytes);
    state.metadata = JSON.parse(state.ctb.metadata());

    renderSettings(state.metadata);
    await renderPreviews();

    const layerCount = state.ctb.layer_count();
    const initialLayer = Math.max(0, Math.floor(layerCount / 2));

    elements.slider.min = "0";
    elements.slider.max = String(Math.max(0, layerCount - 1));
    elements.slider.step = "1";
    elements.slider.disabled = layerCount === 0;
    elements.slider.value = String(initialLayer);
    elements.scrubberPanel.dataset.ready = String(layerCount > 0);

    updateLayerLabels(initialLayer);
    await renderLayer(initialLayer);

    setStatus(`Parsed ${file.name}. ${numberFormat.format(layerCount)} layers ready to inspect.`);
  } catch (error) {
    console.error(error);
    renderSettings(null);
    renderPlaceholder(elements.largePreview, "Parse failed", "The file could not be decoded");
    renderPlaceholder(elements.smallPreview, "Preview unavailable");
    renderPlaceholder(elements.layerCanvas, "Layer viewport", "Try another CTB export");
    elements.layerMeta.textContent = "Layer details unavailable.";
    setStatus(`Failed to parse ${file.name}: ${error.message}`);
  } finally {
    elements.dropZone.dataset.state = "idle";
  }
}

async function renderPreviews() {
  if (!state.ctb || !state.metadata) {
    return;
  }

  const largeSize = state.metadata.previews?.large_size ?? state.ctb.preview_size();
  const smallSize = state.metadata.previews?.small_size ?? [largeSize[0], largeSize[1]];

  await renderRgbaBuffer(
    elements.largePreview,
    state.ctb.large_preview(),
    largeSize[0],
    largeSize[1],
    { background: "#04070c", smoothing: true, maxHeight: 420 },
  );

  await renderRgbaBuffer(
    elements.smallPreview,
    state.ctb.small_preview(),
    smallSize[0],
    smallSize[1],
    { background: "#04070c", smoothing: true, maxHeight: 180 },
  );
}

function queueLayerRender(index) {
  state.pendingLayerIndex = index;
  const token = ++state.layerToken;

  requestAnimationFrame(async () => {
    if (token !== state.layerToken) {
      return;
    }

    await renderLayer(state.pendingLayerIndex, token);
  });
}

async function renderLayer(index, token = ++state.layerToken) {
  if (!state.ctb || !state.metadata) {
    clearCanvas(elements.layerCanvas);
    return;
  }

  setStatus(`Decoding layer ${numberFormat.format(index + 1)}…`);
  await new Promise((resolve) => requestAnimationFrame(resolve));

  if (token !== state.layerToken) {
    return;
  }

  const rgba = state.ctb.decode_layer(index);
  const [width, height] = state.metadata.printer.resolution;
  const layerInfo = JSON.parse(state.ctb.layer_info(index));

  await renderRgbaBuffer(elements.layerCanvas, rgba, width, height, {
    background: "#000000",
    smoothing: false,
    maxHeight: 560,
  });

  if (token !== state.layerToken) {
    return;
  }

  elements.layerMeta.innerHTML = [
    detailRow("Layer", `${numberFormat.format(index + 1)} / ${numberFormat.format(state.ctb.layer_count())}`),
    detailRow("Z Position", `${formatNumber(layerInfo.z_pos_mm)} mm`),
    detailRow("Exposure", `${formatNumber(layerInfo.exposure_time_s)} s`),
    detailRow("Light-Off", `${formatNumber(layerInfo.light_off_delay_s)} s`),
  ].join("");

  setStatus(`Viewing layer ${numberFormat.format(index + 1)}.`);
}

function renderSettings(metadata) {
  if (!metadata) {
    elements.settings.innerHTML = "<p class=\"text-sm text-slate-400\">Drop a CTB file to inspect printer settings, exposure, material estimates, and resin metadata.</p>";
    return;
  }

  const printer = metadata.printer;
  const layers = metadata.layers;
  const exposure = metadata.exposure;
  const estimates = metadata.estimates;
  const resin = metadata.resin;

  elements.settings.innerHTML = [
    settingsGroup("Printer", [
      detailRow("Machine", escapeHtml(printer.name || "Unknown")),
      detailRow("Resolution", `${numberFormat.format(printer.resolution[0])} × ${numberFormat.format(printer.resolution[1])}`),
      detailRow("Build Volume", `${formatNumber(printer.size_mm[0])} × ${formatNumber(printer.size_mm[1])} × ${formatNumber(printer.size_mm[2])} mm`),
    ]),
    settingsGroup("Layers", [
      detailRow("Count", numberFormat.format(layers.count)),
      detailRow("Layer Height", `${formatNumber(layers.height_mm)} mm`),
      detailRow("Total Height", `${formatNumber(layers.total_height_mm)} mm`),
    ]),
    settingsGroup("Exposure", [
      detailRow("Normal", `${formatNumber(exposure.normal_time_s)} s`),
      detailRow("Bottom", `${formatNumber(exposure.bottom_time_s)} s × ${numberFormat.format(exposure.bottom_layers)}`),
      detailRow("Light-Off", `${formatNumber(exposure.light_off_delay_s)} s`),
      detailRow("Lift", `${formatNumber(exposure.lift_height_mm)} mm @ ${formatNumber(exposure.lift_speed_mm_min)} mm/min`),
      detailRow("Retract", `${formatNumber(exposure.retract_speed_mm_min)} mm/min`),
    ]),
    settingsGroup("Estimates", [
      detailRow("Print Time", escapeHtml(estimates.print_time_formatted)),
      detailRow("Resin", `${formatNumber(estimates.material_ml)} ml`),
      detailRow("Weight", `${formatNumber(estimates.material_grams)} g`),
      detailRow("Cost", `$${formatNumber(estimates.material_cost)}`),
    ]),
    settingsGroup("Resin", [
      detailRow("Name", escapeHtml(resin.name || "Unspecified")),
      detailRow("Type", escapeHtml(resin.type || "Unspecified")),
      detailRow("Density", `${formatNumber(resin.density)} g/cm³`),
    ]),
  ].join("");
}

function updateLayerLabels(index) {
  if (!state.ctb || !state.metadata) {
    elements.sliderLabel.textContent = "Layer viewer idle";
    elements.sliderHint.textContent = "Load a CTB file to scrub the layer stack.";
    return;
  }

  const totalLayers = state.ctb.layer_count();
  const current = index + 1;
  const zPosition = state.metadata.layers.height_mm * current;

  elements.sliderLabel.textContent = `Layer ${numberFormat.format(current)} of ${numberFormat.format(totalLayers)}`;
  elements.sliderHint.textContent = `Nominal Z height ${formatNumber(zPosition)} mm`;
}

function settingsGroup(title, rows) {
  return `
    <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h3 class="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">${escapeHtml(title)}</h3>
      <dl class="space-y-2">${rows.join("")}</dl>
    </section>
  `;
}

function detailRow(label, value) {
  return `
    <div class="flex items-start justify-between gap-4 text-sm">
      <dt class="text-slate-400">${escapeHtml(label)}</dt>
      <dd class="text-right font-medium text-slate-100">${value}</dd>
    </div>
  `;
}

function formatNumber(value) {
  return numberFormat.format(Number(value ?? 0));
}

function setStatus(message) {
  elements.status.textContent = message;
}

async function loadDemo() {
  try {
    setStatus("Loading demo file…");
    const response = await fetch("demo.ctb");
    if (!response.ok) return;
    const blob = await response.blob();
    const file = new File([blob], "demo.ctb", { type: "application/octet-stream" });
    await handleFile(file);
  } catch {
    setStatus("Drop a .ctb file or choose one from disk.");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
