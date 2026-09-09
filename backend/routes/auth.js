import { Router } from "express";
import crypto from "crypto";

const router = Router();

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "sih2026";

// POST /api/admin/login
router.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = crypto.randomUUID();
    return res.json({ token, username: ADMIN_USERNAME });
  }

  return res.status(401).json({ error: "Invalid username or password" });
});

export default router;
