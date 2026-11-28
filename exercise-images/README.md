# Exercise demonstrations

Rep Harbor's built-in demos are original vector-style illustrations rendered to WebP from hand-authored poses and equipment in `tools/draw-exercise-demos.py`. Every built-in exercise has a start and finish pose and matching text cues. No photos, stock images, or third-party exercise artwork are used in the demos.

To regenerate the panels and catalog, run `python tools/draw-exercise-demos.py` from the repository root. The authoring script uses Pillow and the DejaVu Sans font. The app loads the generated files directly and requires no Python runtime or image service.

The generic image placeholder remains available for custom exercises without an upload and when a user hides a default. Existing image overrides remain in the same IndexedDB store and take precedence over the bundled illustrations.
