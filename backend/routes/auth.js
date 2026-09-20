import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import store from "../data/store.js";

const router = Router();

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "sih2026";

function checkAdminIdentityMatch(admin, { identityType, identityValue, phone, email } = {}) {
  const type = identityType || (email ? "google" : (phone ? "phone" : null));
  const rawVal = identityValue || (type === "google" ? email : phone);
  if (!rawVal || !type) return false;

  const cleanVal = String(rawVal).trim();
  if (!cleanVal) return false;

  if (type === "google") {
    const inputEmail = cleanVal.toLowerCase();
    return Boolean(admin.email && admin.email.trim().toLowerCase() === inputEmail);
  }

  if (type === "phone") {
    const normInput = cleanVal.replace(/\D/g, "");
    const normStoredPhone = admin.phone ? String(admin.phone).replace(/\D/g, "") : "";
    const normStoredAlt = admin.alternatePhone ? String(admin.alternatePhone).replace(/\D/g, "") : "";

    if (admin.phone && admin.phone.trim() === cleanVal) return true;
    if (admin.alternatePhone && admin.alternatePhone.trim() === cleanVal) return true;

    const inputLast10 = normInput.slice(-10);
    const storedLast10 = normStoredPhone.slice(-10);
    const storedAltLast10 = normStoredAlt.slice(-10);

    if (inputLast10 && storedLast10 && inputLast10 === storedLast10) return true;
    if (inputLast10 && storedAltLast10 && inputLast10 === storedAltLast10) return true;
  }

  return false;
}

// POST /api/admin/verify-identity (Step 2A: Admin Name + Admin ID + Verified Identity Check)
router.post("/admin/verify-identity", (req, res) => {
  const { name, adminId, identityType, identityValue, phone, email } = req.body || {};

  if (!name || !adminId || typeof name !== "string" || typeof adminId !== "string") {
    return res.status(400).json({ error: "Invalid Admin Name or Admin ID." });
  }

  const cleanName = name.trim();
  const cleanAdminId = adminId.trim();

  if (!cleanName || !cleanAdminId) {
    return res.status(400).json({ error: "Invalid Admin Name or Admin ID." });
  }

  // 1. Exact match on Admin ID against stored records
  const matchedAdmin = store.allRegisteredAdmins().find(
    (a) => a && a.adminId && a.adminId.trim().toUpperCase() === cleanAdminId.toUpperCase()
  );

  if (!matchedAdmin) {
    return res.status(400).json({ error: "Invalid Admin Name or Admin ID." });
  }

  // 2. Admin Name exact match (case-insensitive trimmed)
  if (!matchedAdmin.name || matchedAdmin.name.trim().toLowerCase() !== cleanName.toLowerCase()) {
    return res.status(400).json({ error: "Invalid Admin Name or Admin ID." });
  }

  // 3. Step 1 verified identity match against stored identity
  const identityMatches = checkAdminIdentityMatch(matchedAdmin, {
    identityType,
    identityValue,
    phone,
    email,
  });

  if (!identityMatches) {
    return res.status(400).json({ error: "Invalid Admin Name or Admin ID." });
  }

  // Succeeded: proceed to Step 2B. Never return password or passwordHash!
  return res.json({
    success: true,
    verified: true,
    adminId: matchedAdmin.adminId,
    name: matchedAdmin.name,
  });
});

// POST /api/admin/login (Single-step Admin ID + Password Login with Verified Identity Check)
router.post("/admin/login", (req, res) => {
  const {
    adminId,
    username,
    password,
    identityType,
    identityValue,
    phone,
    email,
  } = req.body || {};

  const cleanPassword = password !== undefined && password !== null ? String(password) : "";
  const targetId = adminId || (username && String(username).trim());
  const cleanUser = targetId ? String(targetId).trim() : "";

  // 1. Existing default officer credentials (admin / sih2026) for backward compatibility
  if (cleanUser === ADMIN_USERNAME && cleanPassword === ADMIN_PASSWORD) {
    const token = crypto.randomUUID();
    const registeredAdmin = store.getLatestRegisteredAdmin();
    store.setAdminSession(token, registeredAdmin || { name: "Admin", username: ADMIN_USERNAME });

    let safeAdmin = null;
    if (registeredAdmin) {
      const { password: _p, passwordHash: _ph, ...clean } = registeredAdmin;
      safeAdmin = clean;
    }
    return res.json({ token, username: ADMIN_USERNAME, admin: safeAdmin });
  }

  const GENERIC_ERROR = "Invalid Admin ID or Password.";

  // 2. Single-step Admin ID + Password validation with Step 1 identity check
  if (adminId) {
    const cleanAdminId = String(adminId).trim().toUpperCase();
    if (!cleanAdminId || !cleanPassword) {
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    // Check 1: The entered Admin ID exists in the admin records.
    const matchedAdmin = store.allRegisteredAdmins().find(
      (a) => a && a.adminId && a.adminId.trim().toUpperCase() === cleanAdminId
    );
    if (!matchedAdmin) {
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    // Check 2: The verified Google/Phone identity from Step 1 matches the identity stored for that Admin ID.
    const identityMatches = checkAdminIdentityMatch(matchedAdmin, {
      identityType,
      identityValue,
      phone,
      email,
    });
    if (!identityMatches) {
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    // Check 3: The entered Password matches the stored password hash for that Admin ID
    if (!matchedAdmin.passwordHash) {
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    const isMatch = bcrypt.compareSync(cleanPassword, matchedAdmin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    const token = crypto.randomUUID();
    store.setAdminSession(token, matchedAdmin);
    const { password: _p, passwordHash: _ph, ...safeAdmin } = matchedAdmin;
    return res.json({ token, username: matchedAdmin.name, admin: safeAdmin });
  }

  // 3. Fallback for single-step login by username/phone/email
  if (!cleanUser || !cleanPassword) {
    return res.status(401).json({ error: GENERIC_ERROR });
  }

  const matchedAdmin =
    store.findRegisteredAdmin({
      adminId: cleanUser,
      phone: cleanUser,
      email: cleanUser,
    }) || null;

  if (!matchedAdmin || !matchedAdmin.passwordHash) {
    return res.status(401).json({ error: GENERIC_ERROR });
  }

  const isMatch = bcrypt.compareSync(cleanPassword, matchedAdmin.passwordHash);
  if (!isMatch) {
    return res.status(401).json({ error: GENERIC_ERROR });
  }

  const token = crypto.randomUUID();
  store.setAdminSession(token, matchedAdmin);
  const { password: _p, passwordHash: _ph, ...safeAdmin } = matchedAdmin;
  return res.json({ token, username: matchedAdmin.name, admin: safeAdmin });
});

// POST /api/admin/logout
router.post("/admin/logout", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || req.body?.token;
  if (token) {
    store.clearAdminSession(token);
  }
  res.json({ success: true, message: "Logged out successfully" });
});

export default router;
