import Link from 'next/link'
import type { Metadata } from 'next'

// /poc/stitch — public proof-of-concept page.
//
// Sharable link for early GM feedback. Public — no auth gate, no DB
// reads. Just static images served from the public tiles-rendered
// bucket and a few paragraphs of copy.
//
// Copy is pitched at a TTRPG GM, not an engineer — algorithm names and
// implementation specifics live in the README, not here.

export const metadata: Metadata = {
  title: 'Stitched worlds · MAURO',
  description:
    'Real-Earth and Mars heightmaps stitched into single continents. An early look at how MAURO builds worlds.',
}

const STORAGE_PUBLIC =
  'https://yzopckhonkphhqshzwro.supabase.co/storage/v1/object/public/tiles-rendered/poc'

interface Combo {
  slug: string
  title: string
  archetype: string
  caption: string
}

const COMBOS: Combo[] = [
  {
    slug: 'earth-pamirs-x-earth-patagonia',
    title: 'Pamir massif + Patagonian fjords',
    archetype: 'Earth + Earth',
    caption:
      'Two real heightmaps from Earth — the Pamir massif on the left, ' +
      'the Patagonian fjords on the right — joined into a single continent. ' +
      'A dense alpine spine becomes a glacier-cut coast without a visible ' +
      'seam between the two source regions.',
  },
  {
    slug: 'earth-pamirs-x-mars-tharsis',
    title: 'Pamir massif + Tharsis Montes',
    archetype: 'Earth + Mars',
    caption:
      'Earth on the left, Mars on the right. Olympus Mons is roughly ' +
      'three times taller than Everest in the raw data, so it gets ' +
      'compressed to a believable Earth-scale before stitching — but ' +
      'the volcanic shape is preserved. The result is one continent ' +
      'that has both alpine and volcanic character. This is the move: ' +
      "alien geometry as fantasy substrate, no magic-system explanation needed.",
  },
]

interface WarpCombo {
  slug: string
  title: string
  caption: string
}

const WARP_COMBOS: WarpCombo[] = [
  {
    slug: 'earth-pamirs-x-mars-tharsis-warped',
    title: 'Same data, no longer recognizable',
    caption:
      'Same Pamir + Mars source as above. Top: original stitched output ' +
      'where Olympus Mons is recognizably itself and the Pamir ridges run ' +
      "the way the real range runs. Bottom: each source tile is mirrored " +
      'and rotated before stitching, then the whole canvas is bent through ' +
      "a smooth distortion field. The volcano's symmetry breaks; ridge " +
      "lines turn the wrong direction. The result no longer matches any " +
      'specific real place — it reads as somewhere new.',
  },
  {
    slug: 'earth-pamirs-x-earth-patagonia-warped',
    title: 'Earth + Earth, no longer Earth',
    caption:
      "Same Pamir + Patagonia source. The fjord coast that's so " +
      "distinctively Patagonian — those long horizontal valleys cutting " +
      'in from the west — survives the unmodified pipeline as itself. ' +
      'Once mirroring, rotation, and distortion are applied, those ' +
      "valleys become organic inlets bent into shapes that don't match " +
      'any real glacier system.',
  },
]

export default function StitchPocPage() {
  return (
    <main className="bg-bg flex min-h-screen flex-col">
      {/* Top ledger — same chrome as the world detail page. */}
      <div className="bg-surface border-hairline label-caps flex h-9 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-muted hover:text-ink transition-colors">
            MAURO
          </Link>
          <span className="text-muted">▸</span>
          <span className="text-ink">Stitched worlds · early look</span>
        </div>
        <div className="font-mono text-muted text-[0.65rem] tabular-nums">
          2026-04-30
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 py-12 lg:px-12 lg:py-16">
        {/* Hero */}
        <div className="label-caps mb-7 flex items-center gap-3">
          <span className="bg-stamp h-1.5 w-1.5 rounded-full" />
          MAURO &middot; early look
        </div>
        <h1 className="font-display mb-6 text-5xl leading-[1.05] md:text-6xl">
          Worlds stitched from
          <br />
          <em className="text-stamp">real planets.</em>
        </h1>
        <p className="text-ink font-serif mb-8 max-w-2xl text-lg leading-relaxed">
          Heightmaps from real satellite measurements of Earth and Mars,
          joined into single continents. No hand-painted maps. No image
          generators. Every elevation value is something a satellite
          actually saw.
        </p>
        <p className="font-serif text-muted mb-12 max-w-2xl text-base italic leading-relaxed">
          What you should react to: the seam between two source regions
          should be a straight vertical line — but it isn&rsquo;t. The
          algorithm finds an organic path through where the two
          heightmaps already happen to agree, then blends across that
          path. The output reads as one continent.
        </p>

        {/* Combos — original stitched */}
        <div className="space-y-16">
          {COMBOS.map((c) => (
            <ComboPanel key={c.slug} combo={c} />
          ))}
        </div>

        {/* Section break — shape modification */}
        <div className="mt-24 mb-12">
          <div className="border-hairline border-t" />
          <div className="label-caps mt-12 mb-3 flex items-center gap-3">
            <span className="bg-verdigris h-1.5 w-1.5 rounded-full" />
            Breaking the resemblance
          </div>
          <h2 className="font-display mb-5 text-4xl leading-tight md:text-5xl">
            Same data,
            <br />
            <em className="text-verdigris">unrecognizable continents.</em>
          </h2>
          <p className="text-ink font-serif max-w-2xl text-base leading-relaxed">
            Real-Earth tiles still look like Earth even when they&rsquo;re
            stitched together. To break that recognition, two cheap
            steps run after the stitch: each source tile is randomly
            mirrored and rotated, then the whole continent is bent
            through a smooth distortion field. Geological character
            survives — alpine ranges still read as alpine, volcanic
            shields still read as volcanic — but the shapes no longer
            match any specific real place.
          </p>
        </div>

        <div className="space-y-16">
          {WARP_COMBOS.map((c) => (
            <WarpPanel key={c.slug} combo={c} />
          ))}
        </div>

        {/* Closing note — what this is, what it isn't */}
        <div className="border-hairline mt-20 border-t pt-8">
          <p className="text-muted font-serif text-sm italic leading-relaxed">
            This page is a methodology preview, not the product. The
            actual MAURO workspace lets you build campaign worlds on
            top of substrates like these — nations, factions, a
            time-versioned ledger of everything that&rsquo;s happened
            since the world was made. That&rsquo;s the next milestone.
          </p>
        </div>
      </div>
    </main>
  )
}

function WarpPanel({ combo }: { combo: WarpCombo }) {
  const webImg = `${STORAGE_PUBLIC}/${combo.slug}/comparison_web.jpg`
  return (
    <section>
      <h3 className="font-display mb-4 text-2xl leading-tight md:text-3xl">
        {combo.title}
      </h3>
      <p className="text-ink font-serif mb-6 max-w-3xl text-base leading-relaxed">
        {combo.caption}
      </p>
      <div className="border-hairline overflow-hidden border bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={webImg}
          alt={`Before/after: ${combo.title} — original stitched on top, shape-modified on bottom.`}
          loading="lazy"
          className="block h-auto w-full"
        />
      </div>
    </section>
  )
}

function ComboPanel({ combo }: { combo: Combo }) {
  const webImg = `${STORAGE_PUBLIC}/${combo.slug}/comparison_web.jpg`
  return (
    <section>
      <div className="label-caps mb-2">{combo.archetype}</div>
      <h2 className="font-display mb-4 text-3xl leading-tight md:text-4xl">
        {combo.title}
      </h2>
      <p className="text-ink font-serif mb-6 max-w-3xl text-base leading-relaxed">
        {combo.caption}
      </p>
      <div className="border-hairline overflow-hidden border bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={webImg}
          alt={`Comparison: ${combo.title} — originals on top, stitched on bottom.`}
          loading="lazy"
          className="block h-auto w-full"
        />
      </div>
    </section>
  )
}
