// Lets `requireAuth` hang the verified identity off the request without any
// casting at the call sites. Optional because it is only populated on routes
// that actually run the middleware — use `authedUserId(req)` to read it.
declare global {
  namespace Express {
    interface Request {
      auth?: { userId: number }
    }
  }
}

export {}
