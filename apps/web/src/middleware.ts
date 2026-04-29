import { type NextRequest } from 'next/server'
import { updateSupabaseSession } from '@/lib/supabase-middleware'

export async function middleware(request: NextRequest) {
  return await updateSupabaseSession(request)
}

export const config = {
  matcher: [
    /*
     * Run on all routes EXCEPT:
     *  - _next/static    (Next.js asset bundles)
     *  - _next/image     (image optimization)
     *  - favicon.ico, robots.txt, sitemap.xml
     *  - any path with a file extension (likely a static asset)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
}
