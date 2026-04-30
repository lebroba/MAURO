import Link from 'next/link'
import type { Metadata } from 'next'

// /poc/stitch — public proof-of-concept page.
//
// Shows the two stitch-poc outputs (Earth+Earth and Earth+Mars combos)
// with captions explaining what's actually happening. Sharable link for
// early GM feedback. Public — no auth gate, no DB reads, no Supabase
// session. Just static images served from the public tiles-rendered
// bucket and a few paragraphs of copy.
//
// The full-resolution PNGs are 11-21 MB each; the web JPEGs are ~1 MB
// half-res versions used inline. Full PNG linked for anyone who wants
// to inspect detail.

export const metadata: Metadata = {
  title: 'Stitched worlds · MAURO',
  description:
    'Real-Earth and Mars heightmaps stitched into single continents. Methodology proof for a multi-tile world assembler.',
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
    archetype: 'Tectonic Colossus + Linear Barrier',
    caption:
      'Two real-Earth tiles. The dense alpine massif on the left transitions ' +
      'into deeply incised glacial valleys on the right. There is no straight ' +
      'seam — the algorithm finds an organic path through the overlap zone ' +
      'where the two heightmaps already agree, then blends the rest at multiple ' +
      'frequency bands so low-frequency elevation transitions span a wide buffer ' +
      'while local detail is preserved sharply.',
  },
  {
    slug: 'earth-pamirs-x-mars-tharsis',
    title: 'Pamir massif + Tharsis Montes',
    archetype: 'Tectonic Colossus + Volcanic Extreme',
    caption:
      'Earth on the left, Mars on the right. Olympus Mons reaches 21 km above ' +
      'the Mars datum — three times Everest — but histogram matching against ' +
      'the Earth reference compresses the elevation distribution to credible ' +
      "scale while preserving the volcanic geometry. The shield's radial flanks " +
      'and caldera survive; only the absolute heights are remapped. The result ' +
      'reads as one continent that has both alpine and volcanic character — the ' +
      '"alien geometry preserved as fantasy substrate" thesis MAURO is built on.',
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
          <span className="text-ink">Stitched worlds · POC</span>
        </div>
        <div className="font-mono text-muted text-[0.65rem] tabular-nums">
          2026-04-30 · methodology validation
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 py-12 lg:px-12 lg:py-16">
        {/* Hero */}
        <div className="label-caps mb-7 flex items-center gap-3">
          <span className="bg-stamp h-1.5 w-1.5 rounded-full" />
          MAURO &middot; proof-of-concept &middot; 2026-04-30
        </div>
        <h1 className="font-display mb-6 text-5xl leading-[1.05] md:text-6xl">
          Worlds stitched from
          <br />
          <em className="text-stamp">real planets.</em>
        </h1>
        <p className="text-ink font-serif mb-8 max-w-2xl text-lg leading-relaxed">
          Two heightmaps from NASA SRTM (Earth) and MOLA (Mars) data, blended
          algorithmically into single continents. No hand-painting. No
          generative AI. Every elevation value is something a satellite measured.
        </p>
        <p className="font-serif text-muted mb-12 max-w-2xl text-base italic leading-relaxed">
          What you should react to: the seams. They aren&rsquo;t there. A min-cost
          dynamic-programming path finds the route through the overlap zone where
          two source tiles already agree, then a Burt &amp; Adelson Laplacian-pyramid
          blend feathers each frequency band at the seam-appropriate width.
          Histogram matching closes the planet-scale gap so Mars&rsquo;s 21 km of vertical
          range fits Earth&rsquo;s 9 km without losing geometric character.
        </p>

        {/* Combos */}
        <div className="space-y-16">
          {COMBOS.map((c) => (
            <ComboPanel key={c.slug} combo={c} />
          ))}
        </div>

        {/* Footer note */}
        <div className="border-hairline mt-20 border-t pt-8">
          <div className="label-caps mb-3">Method, in one paragraph</div>
          <p className="text-muted font-serif text-sm leading-relaxed">
            For each tile, remap elevations through the cumulative-distribution-function
            of an Earth reference (Mars and Moon get rescaled invisibly to Earth-credible).
            Place tiles on a canvas with 20% horizontal overlap. Find the minimum-cost
            vertical seam through the overlap region, where cost at each pixel is
            <code className="font-mono text-ink mx-1 not-italic">|h_a − h_b|</code>.
            Blend along that seam via a 6-level Laplacian pyramid (Burt &amp; Adelson 1983),
            so low frequencies blend smoothly across a wide buffer and high frequencies
            blend sharply at the seam itself. Run a final histogram match for global
            coherence. Render hillshade via Horn&rsquo;s method.
          </p>
          <p className="font-mono text-muted mt-4 text-xs leading-relaxed">
            Implementation: ~500 lines of Python (numpy, scipy, Pillow). No ML.
            Source: <span className="text-ink">scripts/stitch-poc/</span> on
            github.com/lebroba/MAURO.
          </p>
        </div>
      </div>
    </main>
  )
}

function ComboPanel({ combo }: { combo: Combo }) {
  const webImg = `${STORAGE_PUBLIC}/${combo.slug}/comparison_web.jpg`
  const fullPng = `${STORAGE_PUBLIC}/${combo.slug}/comparison.png`
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
        {/* Plain img tag (not next/image) — these are direct Supabase URLs
            and we don't want to fight the Image-loader remote-host config
            for a one-off POC page. The web JPEGs are ~1 MB; loading="lazy"
            keeps the second combo from blocking the first paint. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={webImg}
          alt={`Comparison sheet: ${combo.title} — originals on top, stitched output on bottom.`}
          loading="lazy"
          className="block h-auto w-full"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
        <a
          href={fullPng}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-muted hover:text-ink underline transition-colors"
        >
          Full-resolution PNG (~20 MB) →
        </a>
        <span className="text-muted font-mono text-[0.7rem]">
          {combo.slug}
        </span>
      </div>
    </section>
  )
}
