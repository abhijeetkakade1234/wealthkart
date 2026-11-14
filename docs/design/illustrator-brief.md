# Illustrator brief: WealthKart cut-paper set

WealthKart is an app for small private savings circles. Friends put a fixed amount of AVAX into a shared pot every month and lend to each other when someone needs money. The app itself is quiet and almost colourless: off-white pages, black text, one blue accent. The illustration is the only warm, handmade thing in it, so it carries most of the product's personality.

We want one hero illustration and a set of 20 to 30 separate pieces that the app can arrange on its own.

## What the art is for

The art appears in four places, and only these:

1. **Landing page hero.** One large composed piece. Theme: friends' hands dropping coins into a shared clay pot (a matka), with leaves, flowers and mountains around it.
2. **Circle covers.** A wide banner at the top of each circle's page and on its card. The app builds a different cover for every circle by placing 3 to 5 pieces from the set, picked by the circle's address. Pieces have to look good next to each other in any combination.
3. **Empty states.** Small spot drawings when a list has nothing in it yet ("No loans yet"). One per screen: circles, members, loans, votes, activity, plus one general one.
4. **Member avatars.** Tiny single shapes (triangle, sun, leaf, pot, wave, diamond) on a coloured disc, shown at 30 to 40 px. They need to read clearly at that size.

The art never goes inside tables of numbers, forms or anything where someone is deciding about money.

## Style

Folk art made from cut paper. Flat shapes, no gradients, no outlines, no shading or texture other than an optional faint paper grain. Details are cut out of a shape (a leaf's veins, a sun's centre) rather than drawn on top. Edges can be slightly irregular, as if cut with scissors, but not messy. Indian folk motifs are welcome (matka, tulips, paisley-like leaves, birds, simple mountains) but nothing religious and no people's faces.

The founders' reference is in `docs/design/reference-paper-folk.png`. Our rough placeholders are in `docs/design/gallery.html` and in the app's `/kit` page. They show shapes and placement, not the finish we want.

What we don't want: anything playful or cartoonish, 3D, glossy, isometric or "crypto" imagery (rockets, coins with logos, glowing chains).

## Palette

Use only these seven colours. White (#FFFFFF) is allowed for small highlights such as snow on a mountain.

| Name       | Hex       |
| ---------- | --------- |
| Mustard    | `#D79922` |
| Red        | `#F13C20` |
| Cobalt     | `#4056A1` |
| Periwinkle | `#C5CBE3` |
| Cream      | `#EFE2BA` |
| Olive      | `#7C7B26` |
| Forest     | `#1F5A3A` |

Pieces sit on an off-white page (`#FAFAF8`) or on a pale cream or periwinkle ground, so check every piece against all three.

## Piece list

Twenty-four pieces is the target; up to 30 if some come in two variants. Suggested list:

- Leaves: long olive leaf, round forest leaf, leaf sprig, fern
- Flowers: tulip, marigold, lotus (non-religious styling), bud
- Sky: sun, crescent moon, cloud, star cluster
- Land: snowy mountain pair, rolling hill, single tree
- Water: wave band, ripple
- Animals: bird in flight, perched bird, fish
- Objects: matka (clay pot), coin, small basket, hand (cut-paper style, no face or skin detail)

The hero is a separate composed piece, about 560 × 460 at its natural size.

## Files

- **SVG for everything**, plus a PNG export at 2× for the hero only.
- Each piece in its own file, drawn inside a **100 × 100 artboard** with a little breathing room at the edges. The app scales and rotates pieces from that box, so keep the visual weight centred.
- Flat fills only, using the exact hex values above. No strokes that change thickness when scaled (convert them to fills), no masks, filters, embedded images or fonts.
- Group layers as `base` (the main paper shape) and `cut` (the cut-out details). We recolour pieces in code by swapping the `base` and `cut` colours, so each layer should use a single colour.
- Keep paths simple. A piece should be under about 4 KB.
- Names in lower case with hyphens: `leaf-long.svg`, `bird-flight.svg`, `matka.svg`.
- Avatars: six shapes on a 40 × 40 artboard, same layer rules.

## Ownership

On final payment, full ownership of the delivered work and all rights to it transfer to WealthKart, including the right to modify, recolour, combine and resell it in the product, on the website and in marketing. The illustrator may show the work in their own portfolio once the app is public. Please confirm the work is original and contains no stock or AI-generated elements.

## Deliverables and timeline

| Step               | What we get                                       | Timing   |
| ------------------ | ------------------------------------------------- | -------- |
| Style sketch       | 3 pieces (leaf, matka, bird) + rough hero layout  | Week 1   |
| Feedback round     | One round of changes on the sketch                | Week 1–2 |
| Full set           | All pieces as SVG, named and layered as above     | Week 3–4 |
| Hero + final round | Hero SVG + PNG, one round of fixes across the set | Week 5   |

## Budget

To be agreed. Placeholder range: ₹\_\_\_\_\_\_ to ₹\_\_\_\_\_\_ for the full set and hero, paid 30% on the style sketch and 70% on final delivery.

## Contact

Send questions and the style sketch to the WealthKart team through the channel we hired you on. We'll reply within two working days.
