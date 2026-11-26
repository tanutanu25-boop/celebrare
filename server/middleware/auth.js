import jwt from "jsonwebtoken";
import Photographer from "../models/Photographer.js";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be configured with at least 32 characters"
    );
  }

  return secret;
}

export function signAuthToken(user) {
  return jwt.sign(
    {
      sub: user.photographerId,
      photographerId: user.photographerId,
      email: user.email,
      role: user.role || "photographer",
      name: user.name,
    },
    getJwtSecret(),
    { expiresIn: "12h" }
  );
}

export function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret());
}

/**
 * Require valid Bearer JWT token and attach `req.user`.
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const token = authHeader.slice(7).trim();
    const decoded = verifyAuthToken(token);
    const user = await Photographer.findOne({
      photographerId: decoded.photographerId,
    }).select("-passwordHash -__v");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Account no longer exists",
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
  }
}

/**
 * Optional auth middleware: attaches req.user if valid Bearer token is present, otherwise continues.
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const decoded = verifyAuthToken(token);
      const user = await Photographer.findOne({
        photographerId: decoded.photographerId,
      }).select("-passwordHash -__v");
      if (user) req.user = user;
    }
  } catch {
    // Ignore invalid optional token
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: insufficient role permissions",
      });
    }
    next();
  };
}

export function requireAdmin(req, res, next) {
  return requireRole("admin")(req, res, next);
}
