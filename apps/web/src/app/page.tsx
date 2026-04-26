import { PACKAGE_NAME as SIM } from '@mauro/sim'
import { PACKAGE_NAME as LLM } from '@mauro/llm'
import { PACKAGE_NAME as GEO } from '@mauro/geo'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-24">
      <h1 className="text-4xl font-bold">Hello MAURO</h1>
      <p className="text-sm text-gray-500">
        Workspace packages wired: {SIM}, {LLM}, {GEO}.
      </p>
      <p className="text-xs text-gray-400">
        See <code>docs/BRD.md</code> for what we&apos;re building.
      </p>
    </main>
  )
}
