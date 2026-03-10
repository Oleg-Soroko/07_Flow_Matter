# 07_VectorFileds

## Summary
07_VectorFileds is a reference-driven 2D flow field playground built with Three.js, TypeScript, and Vite.  
You shape the motion by editing attractor "voids", tune flow/topology/look/render settings in real time, and export framed outputs for social formats.

## New Features
- Multi-format workflow with `Portrait`, `Square`, and `Landscape` aspect modes.
- Project-shipped default layouts per aspect ratio, plus automatic restore on load.
- Named layout save/load system stored per aspect ratio in `localStorage`.
- Symmetry mode that mirrors left-side edits to the right side.
- Expanded void editing: add, move, resize, press/release, remove, and toggle emitter mode.
- PNG export and animated GIF export (5 seconds at 24 FPS).
- Audio toggle for the bundled default soundtrack.
- Wider UI customization: title/description, palette, bevel, scale, spacing, and scrollbar styling.
- Render diagnostics: FPS readout, FPS limit control, and field debug overlay toggle.

## Getting Started
### Prerequisites
- Node.js 20+ (recommended for current Vite versions)
- npm

### Install
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## Controls
### Canvas Interaction
- `LMB drag` on a void: move void.
- `Shift + LMB drag` on a void: change void radius/influence.
- `LMB click` on a void: toggle pressed state.
- `Double LMB` on empty space: add a void back into the first inactive slot.
- `Mouse wheel` over a void (or selected void): scale void radius.
- `MMB click` on a void: toggle emitter mode.
- `RMB click` on a void: remove void.

### UI Interaction
- Use top buttons to switch `Portrait` / `Square` / `Landscape`.
- Use tabs (`Flow`, `Topology`, `Look`, `Render`, `UI`) for live parameter tuning.
- In `Layout Edit`: save named layouts, load saved layouts, or reset to defaults.
- Use export buttons to save `PNG` or `GIF`.
- Use the speaker button to mute/unmute audio.
- Use the side toggle button to hide/show the control panel.
