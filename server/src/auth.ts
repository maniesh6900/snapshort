import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';

export interface AuthedRequest extends Request {
  user?: { name: string };
}

export function signToken(name: string): string {
  return jwt.sign({ name }, config.jwtSecret, { expiresIn: '30d' });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload === 'string' || typeof payload.name !== 'string') {
      throw new Error('Unexpected token payload');
    }
    req.user = { name: payload.name };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
