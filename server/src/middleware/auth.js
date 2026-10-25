import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-this-secret-in-production');
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.active) return res.status(401).json({ message: 'Not authorized' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: 'Token invalid or expired' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Forbidden: requires role ${roles.join(' or ')}` });
    }
    return next();
  };
}
