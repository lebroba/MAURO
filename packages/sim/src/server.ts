// Server-only surface for @mauro/sim.
//
// Importing this module (directly or transitively) into a client component
// will fail the Next.js build because the underlying files use
// `import 'server-only'`. That's the boundary the eng review's
// service-role-key + sharp + Supabase layers required.
//
// Use `@mauro/sim/server` from API routes, Server Components, and Route
// Handlers. Use `@mauro/sim` (the default barrel) everywhere else for the
// pure types, RNG, and reducer.

export {
  WorldQuery,
  WorldNotFoundError,
  WorldNotYetCreatedError,
} from './query/WorldQuery'
export {
  worldQueryForUser,
  worldQueryForServiceRole,
  worldQueryForTesting,
} from './query/factories'
export { SupabaseTileLoader, type LoadedTile, type TileLoader } from './query/tile-loader'
