require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const initDb = require("./config/initDb");
const authRoutes = require("./routes/auth");
const dbViewerRoutes = require("./routes/dbViewer");
const path = require("path");
const roommateRoutes = require("./routes/roommates");
const listingsRoutes = require("./routes/listings");
const bookingsRoutes = require("./routes/bookings");
const messagesRoutes = require("./routes/messages");
const adminRoutes = require("./routes/admin");
const ownerManagementRoutes = require("./routes/ownerManagement");
const savedListingsRoutes = require("./routes/savedListings");
const forumRoutes = require("./routes/forum");
const leasesRoutes = require("./routes/leases");
const paymentRoutes = require("./routes/payments");
const maintenanceRoutes = require("./routes/maintenance");
const notificationsRoutes = require("./routes/notifications");
const calendarRoutes = require("./routes/calendar");
const ticketsRoutes = require("./routes/tickets");
const app = express();
// NOTE: backend/uploads holds private identity documents and is intentionally
// NOT served statically. Use the authenticated document endpoints instead.
const PORT = process.env.PORT || 5000;

// ─── CORS Configuration ─────────────────────
// credentials: true requires an explicit origin list — wildcard "*" is not allowed by browsers.
const allowedOrigins = [
  "https://boarding-finder-front-end.vercel.app",
  "http://localhost:5173",
];

const csrfProtection = require("./middleware/csrf");
const realtime = require("./utils/realtime");

// Merge any extra origins defined in .env (comma-separated)
if (process.env.CORS_ORIGIN) {
  const envOrigins = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
  allowedOrigins.push(...envOrigins);
}

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
};
app.set("trust proxy", 1); // correct client IPs behind a reverse proxy (rate limiting)
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ─── CSRF Protection ──────────────────────────
app.use(csrfProtection);
// ────────────────────────────────────────────

// ─── Routes ──────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "BoardingFinder API is running 🚀" });
});

app.use("/api/auth", authRoutes);
app.use("/api/db", dbViewerRoutes);
app.use("/api/roommates", roommateRoutes);
app.use("/api/listings", listingsRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerManagementRoutes);
app.use("/api/saved-listings", savedListingsRoutes);
app.use("/api/forum", forumRoutes);
app.use("/api/leases", leasesRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/tickets", ticketsRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Global Error Handler caught:", err);
  // Never leak stack traces or internal error messages to clients in production
  res.status(err.status || 500).json({
    message: "An internal error occurred.",
    ...(process.env.NODE_ENV !== "production" && { error: err.message }),
  });
});
// ─── Start Server ────────────────────────────
const startServer = async () => {
  try {
    // Initialize database tables
    await initDb();

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 CORS origin: ${process.env.CORS_ORIGIN || "*"}`);
    });
    // Real-time notifications & chat messages over WebSockets (/api/ws)
    realtime.attach(server, allowedOrigins);
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
};

// Only listen when run directly (`node server.js`); tests import the app instead.
if (require.main === module) {
  startServer();
}

module.exports = { app, initDb };
