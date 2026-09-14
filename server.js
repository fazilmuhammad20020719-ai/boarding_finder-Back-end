require("dotenv").config();
const express = require("express");
const cors = require("cors");
const initDb = require("./config/initDb");
const authRoutes = require("./routes/auth");
const dbViewerRoutes = require("./routes/dbViewer");
const path = require("path");
const listingsRoutes = require("./routes/listings");
const bookingsRoutes = require("./routes/bookings");
const messagesRoutes = require("./routes/messages");
const adminRoutes = require("./routes/admin");
const ownerManagementRoutes = require("./routes/ownerManagement");
const savedListingsRoutes = require("./routes/savedListings");
const app = express();
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/images/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/images", express.static(path.join(__dirname, "uploads")));
const PORT = process.env.PORT || 5000;

// ─── CORS Configuration ─────────────────────
// credentials: true requires an explicit origin list — wildcard "*" is not allowed by browsers.
const allowedOrigins = [
  "https://boarding-finder-front-end.vercel.app",
  "http://localhost:5173",
];

// Merge any extra origins defined in .env (comma-separated)
if (process.env.CORS_ORIGIN) {
  const envOrigins = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
  allowedOrigins.push(...envOrigins);
}

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.use(express.json());
// ────────────────────────────────────────────

// ─── Routes ──────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "BoardingFinder API is running 🚀" });
});

app.use("/api/auth", authRoutes);
app.use("/api/db", dbViewerRoutes);
app.use("/api/listings", listingsRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerManagementRoutes);
app.use("/api/saved-listings", savedListingsRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Global Error Handler caught:", err);
  res.status(500).json({ 
    message: "An internal error occurred.", 
    error: err.message, 
    stack: err.stack 
  });
});
// ─── Start Server ────────────────────────────
const startServer = async () => {
  try {
    // Initialize database tables
    await initDb();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 CORS origin: ${process.env.CORS_ORIGIN || "*"}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
};

startServer();