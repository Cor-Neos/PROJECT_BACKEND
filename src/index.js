import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import env from "dotenv";

env.config();

// Validate encryption master key on startup
if (!process.env.MASTER_KEY) {
  console.error(
    "\n❌ ERROR: MASTER_KEY environment variable is not set!"
  );
  console.error(
    "   This is required for document encryption in archived cases."
  );
  console.error(
    "   Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
  console.error(
    "   Then add it to your .env file as: MASTER_KEY=<your_64_char_hex_key>\n"
  );
  process.exit(1);
}

if (process.env.MASTER_KEY.length !== 64) {
  console.error(
    "\n❌ ERROR: MASTER_KEY must be exactly 64 hexadecimal characters (32 bytes)!"
  );
  console.error(
    `   Current length: ${process.env.MASTER_KEY.length} characters`
  );
  console.error(
    "   Generate a new one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n"
  );
  process.exit(1);
}

console.log("✅ Encryption master key validated successfully");

import authRoutes from "./routes/authRoute.js";
import userRoutes from "./routes/userRoute.js";
import branchRoutes from "./routes/branchRoute.js";
import clientRoutes from "./routes/clientRoute.js";
import caseRoutes from "./routes/caseRoute.js";
import paymentRoutes from "./routes/paymentRoute.js";
import documentRoutes from "./routes/documentRoute.js";
import notificationRoutes from "./routes/notificationRoute.js";
import reportRoutes from "./routes/reportRoute.js";
import caseTagRoutes from "./routes/caseTagRoute.js";

import requireAdminOrLawyer from "./middleware/requireAdminOrLawyer.js";
import verifyUser from "./middleware/verifyUser.js";

const app = express();
const port = 3000;

app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: [
      "http://localhost:4000",
      "http://localhost:4173" 
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use("/api", branchRoutes);
app.use("/api", userRoutes);
app.use("/api", clientRoutes);
app.use("/api", authRoutes); // authentication api
app.use("/api", caseRoutes);
app.use("/api", paymentRoutes);
app.use("/api", documentRoutes);
app.use("/api", notificationRoutes);
app.use("/api", reportRoutes);
app.use("/api", caseTagRoutes);

// IMPORTANT: mount restricted subpaths BEFORE the generic /uploads static, otherwise
// the generic static will serve files and bypass the role middleware.
app.use(
  "/uploads/taskedDocs",
  verifyUser, // only verified users can access tasked documents
  express.static("C:/Users/Noel Batoctoy/caps/uploads/taskedDocs")
);
app.use(
  "/uploads/supportingDocs",
  verifyUser,
  requireAdminOrLawyer,
  express.static("C:/Users/Noel Batoctoy/caps/uploads/supportingDocs")
); // supporting document uploads (restricted)
app.use(
  "/uploads/referenceDocs",
  verifyUser,
  express.static("D:/Capstone_ni_Angelie/uploads/referenceDocs")
); 

// Keep a generic uploads static for non-sensitive assets (e.g., profile images)
app.use("/uploads", express.static("C:/Users/Noel Batoctoy/caps/uploads"));

app.listen(port, "0.0.0.0", () => {
  console.log(`Listening on port ${port}`);
});

// Testing to get the IP address of the user
app.get("/api/ip", (req, res) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] || // for reverse proxies
    req.socket?.remoteAddress ||
    null;

  res.json({ ip });
});
