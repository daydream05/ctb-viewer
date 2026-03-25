# CLAUDE.md — ctb-viewer

## What This Is

A browser-based .ctb file viewer for resin 3D printing. Parses ChituBox CTB v5 files entirely client-side using WASM (Rust compiled via wasm-pack). No server, no uploads — everything runs in the browser.

**Nothing like this exists online.** This is the first web-based CTB viewer.

## Read First

- `SPEC.md` — full spec with architecture, WASM API, features, and technical decisions
- This file — build instructions and implementation guide

## Architecture

```
User drops .ctb file
  → JavaScript reads as ArrayBuffer
  → Passes to WASM module (CtbFile::parse)
  → WASM returns parsed metadata + preview images
  → JS renders UI: previews, settings panel, layer scrubber
  → Layer scrubber calls WASM to decode individual layers on demand
```

## Existing Parser Code

The CTB parser already exists in the mslicer project. Key files to understand:

- `resin-slicer/format/ctb_format/src/file.rs` — Main `File` struct with `deserialize()`. This is the parser entry point.
- `resin-slicer/format/ctb_format/src/layer.rs` — `Layer` struct, decryption + deserialization of layer data
- `resin-slicer/format/ctb_format/src/layer_coding.rs` — `LayerDecoder` (RLE iterator) and `LayerEncoder`
- `resin-slicer/format/ctb_format/src/preview.rs` — `PreviewImage` (RGB565 RLE encoded thumbnails)
- `resin-slicer/format/ctb_format/src/crypto.rs` — AES decryption for encrypted layer data
- `resin-slicer/common/src/serde/` — `SliceDeserializer` used by all format parsers

## Build

```bash
# Install wasm-pack if not present
cargo install wasm-pack

# Build WASM module
cd wasm
wasm-pack build --target web --out-dir ../web/pkg

# Run dev server
cd ../web
npx serve .
```

## Implementation Plan

### Step 1: WASM Crate Setup
Create `wasm/` crate that depends on `ctb_format` and `common` from the resin-slicer repo.

**Critical:** The `ctb_format` and `common` crates use `image`, `nalgebra`, `sha2`, etc. Most of these compile to WASM fine. If any dependency fails:
- Use `#[cfg(not(target_arch = "wasm32"))]` to gate problematic features
- Or vendor the specific files needed (the parser is ~500 lines total)

### Step 2: WASM Bindings (`wasm/src/lib.rs`)
Expose these functions via `wasm-bindgen`:

```rust
#[wasm_bindgen]
pub struct CtbFile { inner: ctb_format::File }

#[wasm_bindgen]
impl CtbFile {
    pub fn parse(data: &[u8]) -> Result<CtbFile, JsError>;
    pub fn metadata(&self) -> String;           // JSON
    pub fn large_preview(&self) -> Vec<u8>;     // RGBA pixels
    pub fn small_preview(&self) -> Vec<u8>;     // RGBA pixels
    pub fn preview_size(&self) -> Vec<u32>;     // [w, h]
    pub fn layer_count(&self) -> u32;
    pub fn decode_layer(&self, index: u32) -> Vec<u8>;  // Grayscale → RGBA
    pub fn layer_info(&self, index: u32) -> String;     // JSON
}
```

### Step 3: Frontend (`web/`)
Single HTML page with:
- Drop zone (full page drag & drop)
- Preview images (rendered from RGBA data to canvas)
- Settings panel (parsed from metadata JSON)
- Layer scrubber (range input + canvas)

Use Tailwind via CDN for styling. Keep it simple — one `index.html`, one `app.js`, one `renderer.js`.

### Step 4: Layer Rendering
Each decoded layer is a 1-bit-ish image at printer resolution (e.g., 11520×5120).
- `LayerDecoder` outputs `Run { length, value }` where value is 0x00 (off) or 0x01-0xFF (on, with anti-alias levels)
- Convert runs to RGBA pixels: value 0 = transparent/black, value > 0 = white (or map to grayscale for AA)
- Render to canvas, scaled to fit viewport
- For performance: decode layers on demand, not all at once

### Step 5: Deploy
Static site → Vercel or Cloudflare Pages. Just the `web/` folder.

## Conventions

- **No frameworks.** Vanilla JS + HTML + Tailwind CDN. Keep bundle minimal.
- **Dark theme.** Matches the resin printing aesthetic (UV exposure = white on black).
- **Mobile-friendly.** Responsive layout — useful when standing at the printer.
- **Performance:** Lazy layer decoding. Only decode the layer being viewed.
- **Privacy message:** "Your files never leave your browser" prominently displayed.

## Testing

- Use the test CTB file at `/tmp/chibi-test.ctb` (32MB, generated from our pipeline)
- Also test with files from Chitubox (may differ in encryption flags)
- Test on mobile Safari + Chrome

## SEO

Add proper meta tags, structured data, and target these keywords:
- "ctb file viewer online"
- "open ctb file without chitubox"
- "resin 3d print file preview"
- "chitubox file viewer"
