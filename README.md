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

## Deployment
### Live Demo
- https://oleg-soroko.github.io/07_Flow_Matter/

### Build Locally (GitHub Pages Ready)
Build with a relative base path so asset/media URLs stay relative:

```bash
npm ci
npm run build -- --base ./
npm run preview
```

The production output is generated in `dist/`.

### Deploy to GitHub Pages (`gh-pages`)
1. Build locally with `npm run build -- --base ./`.
2. Create a temporary deploy folder outside this project and copy the contents of `dist/` into it.
3. In that deploy folder, include:
   - `index.html`
   - `assets/`
   - `.nojekyll`
   - `env/.gitkeep` (optional placeholder)
   - any static media files required by the app (for example `DefaultSound_01.mp3`, `mask.png`, `Reference.gif`)
4. Initialize git in that deploy folder, commit the static files, and push that commit to the remote `gh-pages` branch.
5. In GitHub repository settings, set Pages source to `gh-pages` and folder `/ (root)`.
