export default function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center">
      {steps.map((label, index) => {
        const step = index + 1
        const done = step < current
        const active = step === current
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  done ? 'bg-teal text-white' : active ? 'bg-teal text-white' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {done ? '✓' : step}
              </div>
              <span className={`mt-1 text-[11px] font-medium ${active ? 'text-ink' : 'text-slate-400'}`}>{label}</span>
            </div>
            {step < steps.length && <div className={`mx-2 h-0.5 w-8 sm:w-14 ${done ? 'bg-teal' : 'bg-slate-100'}`} />}
          </div>
        )
      })}
    </div>
  )
}
