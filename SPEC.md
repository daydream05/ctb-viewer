# CTB Online Viewer — Spec

## Problem

There is no online tool to preview .ctb files (ChituBox resin 3D printer format). Users currently need to download Chitubox desktop software just to check a sliced file. This is the only format widely used for MSLA/DLP resin printers with zero web-based viewer.

## Solution

A client-side web app that parses and visualizes .ctb files entirely in the browser using WASM. No server required, no uploads — everything runs locally.

## Target User

- Resin 3D printer hobbyists who want to quickly preview a .ctb file
- Makers sharing files who want to verify before printing
- Marketplace sellers (Etsy, CGTrader) who want to show print previews

## Architecture

```
.ctb file (drag & drop / file picker)
        ↓
  WASM module (Rust → wasm-pack)
  - Parses CTB v5 header
  - Extracts preview images
  - Decodes layer data (RLE + encryption)
        ↓
  JavaScript frontend
  - Renders preview thumbnails
  - Layer scrubber (canvas-based)
  - Print settings panel
  - Estimated print time
```

### Existing Code to Reuse

The `ctb_format` crate from mslicer (`/Users/vincep/projects/resin-slicer/format/ctb_format/`) already has:
- Complete CTB v5 parser (`file.rs` — `File::deserialize`)
- Layer decoding with RLE + XOR encryption (`layer.rs`, `layer_coding.rs`, `crypto.rs`)
- Preview image decoding (`preview.rs` — RGB565 RLE)
- Full file structure: header, printer info, exposure settings, resin parameters, layers

We just need a thin WASM binding layer on top.

### Tech Stack
- **WASM:** Rust + `wasm-pack` + `wasm-bindgen`
- **Frontend:** Single-page app (vanilla JS or lightweight framework)
- **Styling:** Tailwind CSS
- **Deploy:** Vercel or Cloudflare Pages (static site)
- **Domain:** ctbviewer.com / viewctb.com (or subdomain of existing site)

## WASM API Surface

```rust
// Exposed to JavaScript via wasm-bindgen

#[wasm_bindgen]
pub struct CtbFile { /* parsed file handle */ }

#[wasm_bindgen]
impl CtbFile {
    /// Parse a .ctb file from bytes
    pub fn parse(data: &[u8]) -> Result<CtbFile, JsError>;
    
    /// Get file metadata as JSON
    pub fn metadata(&self) -> String; // JSON
    
    /// Get large preview image as RGBA bytes
    pub fn large_preview(&self) -> Vec<u8>;
    
    /// Get small preview image as RGBA bytes  
    pub fn small_preview(&self) -> Vec<u8>;
    
    /// Get preview image dimensions
    pub fn preview_size(&self) -> Vec<u32>; // [width, height]
    
    /// Get total layer count
    pub fn layer_count(&self) -> u32;
    
    /// Decode a specific layer as RGBA pixel data
    pub fn decode_layer(&self, index: u32) -> Vec<u8>;
    
    /// Get layer info (z position, exposure, etc.) as JSON
    pub fn layer_info(&self, index: u32) -> String;
}
```

### Metadata JSON shape
```json
{
  "format_version": 5,
  "printer": {
    "name": "Saturn 3",
    "resolution": [11520, 5120],
    "size_mm": [218.88, 122.88, 260.0]
  },
  "layers": {
    "count": 2032,
    "height_mm": 0.05,
    "total_height_mm": 101.6
  },
  "exposure": {
    "normal_time_s": 3.0,
    "bottom_time_s": 30.0,
    "bottom_layers": 3,
    "light_off_delay_s": 0.0,
    "lift_height_mm": 5.0,
    "lift_speed_mm_min": 65.0,
    "retract_speed_mm_min": 150.0
  },
  "estimates": {
    "print_time_s": 7200,
    "print_time_formatted": "2h 0m",
    "material_ml": 12.5,
    "material_grams": 14.1,
    "material_cost": 1.2
  },
  "resin": {
    "name": "",
    "type": "",
    "cost": 0.0,
    "density": 0.0
  }
}
```

## Frontend Features

### MVP (v0.1)

1. **Drop zone** — Drag & drop or file picker for .ctb files
2. **Preview thumbnails** — Display the two embedded preview images (large + small)
3. **Print settings panel** — Parsed metadata in a clean card layout:
   - Printer name, resolution
   - Layer count, layer height, total height
   - Exposure settings (normal + bottom)
   - Lift/retract speeds
   - Estimated print time
   - Material usage (ml, grams, cost)
4. **Layer scrubber** — Range slider to scrub through layers, rendered on HTML canvas
   - Shows current layer number / total
   - Z-height indicator
   - Layer image rendered as white-on-black (matching actual UV exposure)
5. **Responsive** — Works on mobile (useful at the printer)

### v0.2+

- GOO format support (Elegoo printers)
- 3D reconstruction from layer stack (Three.js voxel/marching cubes)
- Side-by-side layer comparison
- Print time calculator with custom speed overrides
- Share via URL (encode small metadata, not the file)
- PWA / offline support

## File Structure

```
ctb-viewer/
├── wasm/
│   ├── Cargo.toml              # WASM crate, depends on ctb_format + common
│   ├── src/
│   │   └── lib.rs              # wasm-bindgen bindings
│   └── build.sh                # wasm-pack build script
├── web/
│   ├── index.html
│   ├── style.css               # Tailwind
│   ├── app.js                  # Main app logic
│   ├── renderer.js             # Canvas layer rendering
│   └── pkg/                    # wasm-pack output (gitignored, built)
├── package.json                # For Vercel deployment
├── CLAUDE.md
├── README.md
└── LICENSE                     # MIT
```

## Build Pipeline

```bash
# Build WASM
cd wasm && wasm-pack build --target web --out-dir ../web/pkg

# Dev server
cd web && npx serve .

# Deploy
vercel --prod
```

## Key Technical Decisions

1. **Reuse ctb_format as-is** — Don't rewrite the parser. Import it as a dependency in the WASM crate. May need minor `#[cfg(not(target_arch = "wasm32"))]` gates for features that use filesystem or image crate features not compatible with WASM.

2. **Layer rendering on Canvas** — Each layer is a 2D bitmap (printer resolution, e.g. 11520×5120 for Saturn 3). Decode to grayscale, render on canvas with scaling. For performance, decode on demand (not all layers at once).

3. **No server** — 100% client-side. Files never leave the browser. This is a trust/privacy feature for the resin printing community.

4. **Preview images are easy wins** — CTB files embed two preview thumbnails. These can be displayed immediately after parsing the header, before any layer decoding.

## Dependencies (WASM crate)

```toml
[dependencies]
wasm-bindgen = "0.2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
js-sys = "0.3"

# Local deps from mslicer
ctb_format = { path = "../../resin-slicer/format/ctb_format" }
common = { path = "../../resin-slicer/common" }
```

Note: May need to fork/vendor `ctb_format` and `common` to strip non-WASM-compatible deps (e.g., `image` crate's filesystem features). Evaluate during build.

## SEO Value

Target keywords with zero competition:
- "ctb file viewer online"
- "open ctb file without chitubox"  
- "ctb file preview"
- "chitubox file viewer online"
- "resin print file viewer"
- "view sliced 3d print file"

## Open Questions

1. **WASM compatibility** — `ctb_format` uses `image` crate and `nalgebra`. Both should compile to WASM, but need to verify. May need feature flags.
2. **Large file handling** — CTB files can be 30-100MB+. Need to test WASM memory limits. May need streaming/chunked parsing for very large files.
3. **Layer resolution** — Saturn 3 layers are 11520×5120 pixels. Rendering full-res on canvas may be slow. Consider downscaling for the scrubber, full-res on zoom.
4. **GOO support** — mslicer also has `goo_format`. Adding GOO support later should be straightforward with the same pattern.
