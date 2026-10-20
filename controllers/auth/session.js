const { rotateSession, revokeSession } = require("../../utils/tokens");

// POST /api/auth/refresh — exchange the HTTP-only refresh cookie for a new access token
const refresh = async (req, res) => {
  try {
    const session = await rotateSession(req, res);
    if (!session) {
      await revokeSession(req, res);
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }
    return res.status(200).json({ token: session.accessToken });
  } catch (err) {
    console.error("Refresh error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

// POST /api/auth/logout — revoke the refresh token and clear the cookie
const logout = async (req, res) => {
  try {
    await revokeSession(req, res);
    return res.status(200).json({ message: "Logged out." });
  } catch (err) {
    console.error("Logout error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

module.exports = { refresh, logout };
