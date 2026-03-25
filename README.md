# CTB Viewer

Preview resin 3D print files (.ctb) directly in your browser. No software to install, no uploads — everything runs locally.

## Features

- **Drag & drop** any .ctb file
- **Preview thumbnails** extracted from the file
- **Print settings** — layer count, exposure times, lift speeds, estimated print time
- **Layer scrubber** — slide through every layer of the print
- **100% client-side** — your files never leave your browser

## Why?

Currently, the only way to preview a .ctb file is to install ChituBox (500MB+ desktop app). This viewer runs in your browser in seconds.

## How It Works

The CTB parser is written in Rust and compiled to WebAssembly. When you drop a file, it's parsed entirely in your browser — no server involved.

## Development

```bash
# Build WASM
cd wasm && wasm-pack build --target web --out-dir ../web/pkg

# Run locally
cd web && npx serve .
```

## License

MIT
