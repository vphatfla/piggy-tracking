/** Notice styling is shared by the error and empty states so a message never
 *  relies on colour alone to read as one. */
export function ErrorNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-card bg-danger/10 px-4 py-3 text-subheadline text-danger-text"
    >
      <span className="font-semibold">Error. </span>
      {children}
    </p>
  )
}
