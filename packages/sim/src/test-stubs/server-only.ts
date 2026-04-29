// Vitest stub for the 'server-only' package.
//
// The real module unconditionally throws — that's how it enforces the
// client/server boundary in Next.js's bundler. In Node tests, no bundler
// runs so the throw is unwarranted; we alias it to this no-op via
// vitest.config.ts.
//
// This file is NEVER bundled into the production build. Only vitest's
// resolve.alias points at it.
export {}
