import type { RequestHandler, Request, Response, NextFunction } from 'express'

export function createAsyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
    return (req, res, next) => {
        handler(req, res, next).catch(next)
    }
}
