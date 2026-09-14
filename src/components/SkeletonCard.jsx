/** Loading placeholder mirroring FlightCard's shape so the list doesn't jump. */
export default function SkeletonCard() {
  return (
    <div className="animate-shimmer rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex w-full items-center gap-3 lg:w-52">
          <div className="h-10 w-10 shrink-0 rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-surface-2" />
            <div className="h-2.5 w-14 rounded bg-surface-2" />
          </div>
        </div>
        <div className="flex-1 space-y-3">
          <div className="h-3 rounded bg-surface-2" />
          <div className="h-3 w-4/5 rounded bg-surface-2" />
        </div>
        <div className="space-y-2 lg:w-44">
          <div className="h-6 w-24 rounded bg-surface-2 lg:ml-auto" />
          <div className="h-8 w-28 rounded bg-surface-2 lg:ml-auto" />
        </div>
      </div>
    </div>
  )
}
