import { APP_ID } from "@/app.config";
import jwt from "jsonwebtoken";


/**
 * Erstellt einen JWT-Token für die AMP App API Authentifizierung mit Dual-Key Verification
 * Der Token enthält sowohl den AMP API Key als auch den Target App API Key
 * Der Token ist 5 Minuten gültig
 *
 * @param targetApiKey - Der API Key der Ziel-App (aus der DB)
 * @param targetAppId - Die appAppId der Ziel-App (optional, für zusätzliche Validierung)
 */
export function createAMPAppApiToken(targetApiKey: string, targetAppId?: string): string {
    const payload = {
        apiKey: process.env.API_KEY,         // Global AMP Key (Issuer Authority)
        targetApiKey: targetApiKey,          // Target App Key (muss von Target App geprüft werden)
        targetAppId: targetAppId,            // Optional: Welche App ist gemeint
        iat: Math.floor(Date.now() / 1000),
    };

    // Signiere den Token mit dem AMP API Key als Secret
    // Der Token ist 5 Minuten gültig
    const token = jwt.sign(payload, process.env.API_KEY || "", {
        expiresIn: "5m",
        issuer: APP_ID,
    });

    return token;
}

/**
 * Verifiziert einen AMP App API Token mit Dual-Key Verification
 * Prüft 3 Dinge:
 * 1. JWT Signatur ist valid (signiert mit AMP Key)
 * 2. payload.apiKey === AMP_API_KEY (Issuer Authority)
 * 3. payload.targetApiKey === myApiKey (Target App Authorization)
 *
 * @param token - Der JWT Token aus dem Authorization Header
 * @param myApiKey - Der eigene API Key dieser App (aus env/config)
 * @param expectedAppId - Optional: Erwartete appAppId für zusätzliche Validierung
 */
export function verifyAMPAppApiToken(token: string, myApiKey: string, expectedAppId?: string): boolean {
    try {
        // 1. Verify JWT signature with AMP Key
        const decoded = jwt.verify(token, process.env.API_KEY || "", {
            issuer: APP_ID,
        }) as jwt.JwtPayload;

        // 2. Check AMP API Key (Issuer Authority)
        if (decoded.apiKey !== process.env.API_KEY) {
            console.error("Invalid AMP API Key in token payload");
            return false;
        }

        // 3. Check Target API Key (Target App Authorization)
        if (decoded.targetApiKey !== myApiKey) {
            console.error("Invalid Target API Key in token payload");
            return false;
        }

        // 4. Optional: Check Target App ID
        if (expectedAppId && decoded.targetAppId !== expectedAppId) {
            console.error(`Invalid Target App ID. Expected: ${expectedAppId}, Got: ${decoded.targetAppId}`);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Fehler bei der Verifizierung des AMP App API Tokens:", error);
        return false;
    }
}
