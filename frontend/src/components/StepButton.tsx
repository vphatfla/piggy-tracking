export function StepButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-full text-accent-text transition-colors duration-200 ease-out hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      {children}
    </button>
  )
}
