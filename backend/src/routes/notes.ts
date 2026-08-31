import { Router } from 'express'
import { prisma } from '../prisma.ts'

export const notesRouter = Router()

// GET /api/notes — newest first
notesRouter.get('/', async (_req, res, next) => {
  try {
    const notes = await prisma.note.findMany({ orderBy: { createdAt: 'desc' } })
    res.json(notes)
  } catch (err) {
    next(err)
  }
})

// POST /api/notes — { title: string, content?: string }
notesRouter.post('/', async (req, res, next) => {
  try {
    const { title, content } = req.body ?? {}
    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title is required and must be a non-empty string' })
      return
    }
    if (content !== undefined && content !== null && typeof content !== 'string') {
      res.status(400).json({ error: 'content must be a string when provided' })
      return
    }
    const note = await prisma.note.create({
      data: { title: title.trim(), content: content ?? null },
    })
    res.status(201).json(note)
  } catch (err) {
    next(err)
  }
})
