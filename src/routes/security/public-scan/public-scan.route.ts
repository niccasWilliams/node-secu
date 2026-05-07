// Public-Scan-Route — einziger anonymer Endpunkt im System.
// Kein Auth, aber Rate-Limiting per IP-Hash + Consent-Pflicht.

import express from "express";
import { publicScanController } from "./public-scan.controller";

const router = express.Router();

router.post("/scan", publicScanController.runScan.bind(publicScanController));

export default router;
