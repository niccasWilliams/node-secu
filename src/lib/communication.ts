


import axios from "axios";
import { Response } from "express";




export async function sendToFrontendAPI(route: string, data: any) {
    let FRONTEND_HOST = "localhost:3000"
    if (process.env.FRONTEND_HOST_NAME !== "localhost") {
        FRONTEND_HOST = process.env.FRONTEND_HOST_NAME || "localhost:3000";
    }

    const FRONTEND_API_URL = process.env.FRONTEND_HOST_NAME !== "localhost" ? `https://${process.env.FRONTEND_HOST_NAME}/api${route}` : `http://localhost:3000/api${route}`

    try {

        const response = await axios.post(FRONTEND_API_URL, data, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.FRONTEND_API_KEY}`
            },
        });
        console.log("SEND TO FRONTEND: ", FRONTEND_API_URL, data)
        return response;
    } catch (error: any) {
        console.error("failed to send request to: ", FRONTEND_API_URL)
        throw error.message
    }
}

export async function sendToFrontendAPIGet(route: string) {
    const FRONTEND_HOST = process.env.FRONTEND_HOST_NAME !== "localhost"
        ? process.env.FRONTEND_HOST_NAME
        : "localhost:3000";

    const FRONTEND_API_URL =
        process.env.FRONTEND_HOST_NAME !== "localhost"
            ? `https://${FRONTEND_HOST}/api${route}`
            : `http://localhost:3000/api${route}`;

    try {
        const response = await axios.get(FRONTEND_API_URL, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.FRONTEND_API_KEY}`
            },
        });

        if (process.env.FRONTEND_API_DEBUG === "true") {
            console.log("SEND TO FRONTEND: ", FRONTEND_API_URL);
        }
        return response;
    } catch (error: any) {
        const statusCode = error?.response?.status;
        console.error(
            "❌ Failed to send request to: ",
            FRONTEND_API_URL,
            statusCode ? `(status ${statusCode})` : ""
        );

        const errorMessage = statusCode
            ? `Frontend API request failed with status ${statusCode}`
            : "Frontend API request failed";
        const wrappedError = new Error(errorMessage);
        (wrappedError as any).statusCode = statusCode;
        (wrappedError as any).responseData = error?.response?.data;
        throw wrappedError;
    }
}



export function responseHandler(
    res: Response,
    statusCode: number,
    message?: unknown,
    data?: any
) {
    // Alle 2xx-Codes sind Erfolge. Speziell 202 (Accepted) wird vom
    // async-Playbook-Start verwendet — wenn wir das nicht als success markieren,
    // sieht der Client `success:false` obwohl der Run sauber gestartet wurde.
    const success = statusCode >= 200 && statusCode < 300

    const normalizeMessage = (input: unknown): string | undefined => {
        if (input == null) return undefined

        // string direkt
        if (typeof input === "string") return input

        // Error instance
        if (input instanceof Error) return input.message || "An error occurred"

        // objects: message / message.message / etc.
        if (typeof input === "object") {
            const obj = input as any

            // häufig: { message: "..." }
            if (typeof obj.message === "string") return obj.message

            // häufig: { message: { message: "..." } }
            if (obj.message && typeof obj.message === "object") {
                if (typeof obj.message.message === "string") return obj.message.message
                if (typeof obj.message.error === "string") return obj.message.error
            }

            // alternativ: { error: "..." } oder { error: { message: "..." } }
            if (typeof obj.error === "string") return obj.error
            if (obj.error && typeof obj.error === "object" && typeof obj.error.message === "string") {
                return obj.error.message
            }

            // letzte Option: toString()
            const str = String(obj)
            if (str && str !== "[object Object]") return str
        }

        return undefined
    }

    const defaultMessage = success ? undefined : "An error occurred"
    const normalized = normalizeMessage(message)

    return res.status(statusCode).json({
        success,
        message: normalized ?? defaultMessage,
        data: data ?? null,
    })
}
