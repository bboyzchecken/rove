# public/brand

The ROVE brand assets (DEV_SPEC §15). Colours and type live in
`styles/brand.css` — these files are the only place the mark itself is drawn.

| file | when to use |
|---|---|
| `logo.svg` | default wordmark, light backgrounds (espresso body, terracotta asterisk) |
| `logo-dark.svg` | dark backgrounds (white body, terracotta asterisk) |
| `mark.svg` | app icon, favicon, OG image, anywhere the wordmark will not fit |

The `O` is drawn as eight rounded petals rather than a Unicode `✳`, which
renders differently on every platform and goes soft at favicon size. Eight
directions is the point of the mark: a trip with no fixed route.

Changing a brand colour means changing `styles/brand.css` **and** the two
hardcoded hex values in each SVG here — an SVG in `public/` cannot read a CSS
custom property from the page.
