// Generates a short-lived Williams-JWT for operator/Claude access.
// Usage: node scripts/operator-token.cjs [expiresIn]
// Default expiry: 7d. Pass e.g. "1h" as first arg for shorter tokens.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const jwt = require("jsonwebtoken");

const secret = process.env.FRONTEND_API_KEY;
if (!secret) {
  process.stderr.write("FRONTEND_API_KEY not set in .env\n");
  process.exit(1);
}

const expiresIn = process.argv[2] || "7d";
const token = jwt.sign({ userId: 2 }, secret, { expiresIn });
process.stdout.write(token + "\n");
