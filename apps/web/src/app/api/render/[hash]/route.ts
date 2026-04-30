import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-service'

// GET /api/render/[hash].png
//
// Streams a content-addressed hillshade PNG from Supabase Storage. The
// substrate hash is computed by WorldQuery (SHA256 over post-replay
// heightmap bytes); the PNG was uploaded by prep-tiles.ts (for the source
// state) or by the writer-route render path (Item 8 — for event-mutated
// states).
//
// Cache-Control: substrate hashes are immutable, so the returned PNG is
// safe to cache forever. Browsers and CDNs both honor `immutable`.
//
// Test plan refs:
//   #33 happy path: existing hash → streams PNG with immutable cache headers
//   #34 not-found:  unknown hash → 404 (no 500)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STORAGE_BUCKET = 'tiles-rendered'

interface PageProps {
  params: Promise<{ hash: string }>
}

export async function GET(_request: Request, { params }: PageProps) {
  const { hash: hashWithExt } = await params

  // Hash filenames are SHA256 hex (64 chars) + '.png'. Reject anything else
  // before touching Storage to avoid path-traversal nonsense.
  const match = /^([0-9a-f]{64})\.png$/i.exec(hashWithExt)
  if (!match) {
    return new NextResponse('Invalid hash format', { status: 400 })
  }
  const hash = match[1]!.toLowerCase()
  const objectPath = `${hash}.png`

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(objectPath)

  if (error || !data) {
    // Storage returns an error for both "not found" and "permission denied".
    // For our public bucket the only realistic case is missing — return 404.
    return new NextResponse('Render not found', { status: 404 })
  }

  const arrayBuffer = await data.arrayBuffer()
  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      // Substrate hash is immutable — same bytes will always produce the
      // same hash. Tell every cache layer to keep this forever.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}
