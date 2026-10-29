# The shape stays

Show how a stencil turns a broad sweep of ink into one precise shape. The paper,
roller and print share a single continuous shot so each action explains the next.

- 0.2s: the stencil settles on a blank receiving sheet.
- 2.1s: a leaf-shaped cutout moves aside, exposing the opening.
- 4.4–7.5s: the roller crosses the sheet; ink reaches the paper through the opening.
- 8.7–10.5s: the stencil lifts away; the printed shape remains.
- 11–14.1s: hold the finished print and the final explanation. The scene ends after
  `readingTime` for that final line plus one second.

Warm cream stock, ochre cut paper, deep teal pigment and a clay-colored roller
handle. Slightly uneven edges and fixed fibers suggest a small print shop.
Large serif type carries the heading; short sans-serif lines describe the action.
Motion belongs to the materials, with no decorative idle animation.

Review at 1.2, 3.5, 6.0, 9.6 and 12.2 seconds in landscape 960×540,
portrait 540×960 and square 640×640. Portrait reserves top, bottom and side
insets. The side-by-side landscape layout becomes a vertical composition in the
other targets.

Edit the heading and explanations in the MDX body. Edit named marks, motion spans,
palette, seed, labels and sound cues on the visual's MDX element. Every time prop
is resolved through `defineVisual.times`.

All shapes, textures and motion are original procedural artwork authored for
this repository. No reference artwork, stock footage, imported media, external
asset URLs or new dependencies are used. System serif and sans-serif fonts
require no bundled font license. The three restrained synthesized effects use
the repository's existing `click` and `whoosh` voices. These files use the same
license as their enclosing repository; no separate third-party asset license is
required.

Texture and geometry are created once with a fixed seed. Seeking changes only
retained transforms, visibility, alpha and the selected explanation. The visual
sets every changing property from time, including backward and arbitrary seeks.
