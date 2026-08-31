import { useEffect, useState } from 'react'
import { createNote, getHealth, getNotes, type Note } from './api'

export default function App() {
  const [health, setHealth] = useState<string>('checking…')
  const [notes, setNotes] = useState<Note[]>([])
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setError(null)
    try {
      const [h, n] = await Promise.all([getHealth(), getNotes()])
      setHealth(h.status)
      setNotes(n)
    } catch (e) {
      setHealth('unreachable')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await createNote({ title: title.trim(), content: 'Created from the frontend' })
      setTitle('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const healthy = health === 'ok'

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-transparent">
            Piggy Tracking
          </h1>
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${healthy ? 'bg-emerald-400' : 'bg-rose-500'}`}
            />
            backend: <span className="font-mono">{health}</span>
          </p>
        </header>

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New note title…"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-sky-400"
          />
          <button
            type="submit"
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
          >
            Add note
          </button>
        </form>

        {error && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}

        <ul className="space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 shadow-lg"
            >
              <h2 className="font-semibold text-slate-100">{note.title}</h2>
              {note.content && <p className="mt-1 text-sm text-slate-400">{note.content}</p>}
              <time className="mt-2 block font-mono text-xs text-slate-500">
                {new Date(note.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
          {notes.length === 0 && !error && (
            <li className="text-sm text-slate-500">No notes yet.</li>
          )}
        </ul>
      </div>
    </main>
  )
}
