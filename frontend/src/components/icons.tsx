export const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
    <path
      d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const SlidersIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
    <path
      d="M4 8h10M18 8h2M4 16h4M12 16h8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="16" cy="8" r="2.25" stroke="currentColor" strokeWidth="2" />
    <circle cx="10" cy="16" r="2.25" stroke="currentColor" strokeWidth="2" />
  </svg>
)

export const ChevronDown = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4 text-accent-text" fill="none" aria-hidden>
    <path d="M5 13l4 4 10-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const CloseIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

export const PlusIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)

export const PencilIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5 text-accent-text" fill="none" aria-hidden>
    <path
      d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const CameraIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5 text-label-tertiary" fill="none" aria-hidden>
    <path
      d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1-2h6l1 2h2.5A1.5 1.5 0 0 1 20 8.5V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17V8.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12.5" r="3.25" stroke="currentColor" strokeWidth="1.8" />
  </svg>
)

export const UploadIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5 text-label-tertiary" fill="none" aria-hidden>
    <path
      d="M12 15V4m0 0 4 4m-4-4-4 4M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
