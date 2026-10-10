# web3d

Source for the live 3D demo on `websites.html`: the spinning Fizzbok cans, the
demo shop, scroll reveals and tilting cards.

- `src/websites.js` page script (small, loads first)
- `src/scene.js` three.js scene, loaded only when a 3D area nears the screen
- `src/label.js` draws the can labels in code (no image files)
- `src/flavors.js` the made-up range: names, colors, prices

Build output goes to `/assets/web3d/` and is committed, because GitHub Pages
serves the repo as-is. After any change in `src/`:

```
cd web3d
npm ci
npm run build
```

Commit the changed files in `/assets/web3d/` with your source change. CI runs
`npm run check`, which rebuilds and fails if the committed bundle is out of date.

The can stills (`can-*.webp`) are renders of this same scene. They show before
the 3D loads, on devices without WebGL, and in the product cards.
