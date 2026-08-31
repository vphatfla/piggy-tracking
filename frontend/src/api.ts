// Base URL of the backend running in docker-compose. Override with VITE_API_URL
// in frontend/.env.local if you expose the backend on a different port/host.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export type Note = {
  id: number
  title: string
  content: string | null
  createdAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const getHealth = () => request<{ status: string; uptime: number }>('/api/health')
export const getNotes = () => request<Note[]>('/api/notes')
export const createNote = (body: { title: string; content?: string }) =>
  request<Note>('/api/notes', { method: 'POST', body: JSON.stringify(body) })
