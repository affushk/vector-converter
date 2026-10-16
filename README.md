# Vector Converter Pro v4

Mobile-first JPG/PNG to SVG vector converter tuned for digital textile artwork.

## v4 Printer Match upgrades
- High-resolution internal supersampling
- Auto solid-colour detection
- Shape-preserving cleanup
- Small round-dot protection
- Smoother curve tracing
- Magic-Wand-friendly exact solid RGB palette
- Editable palette
- SVG + clean PNG export
- Printer Match, Textile Solid, Sharp Motif, Fine Detail and Scan Rescue modes
- No paid API; browser-side processing

Website preview:
https://raw.githack.com/affushk/vector-converter/main/public/v4.html

Previous v3 is still kept in the repository.
The bundled vector engine is ImageTracerJS 1.2.6 (Unlicense / public domain).


## One-click Node deployment

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/affushk/vector-converter)

The Blueprint asks for private values in the Render dashboard. Do not commit API secrets to GitHub.

After deployment, open:
- `/secure` for the secure Free / Pro / Owner version
- `/api/health` to verify the Node backend
