import crypto from "crypto";

const ENCRYPTION_KEY_ENV = "DATA_ENCRYPTION_KEY";
const ENCRYPTION_PREFIX = "enc.v1";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

type Nullable<T> = T | null | undefined;

export class EncryptionService {
    private cachedKey?: Buffer;

    private getKey(): Buffer {
        if (this.cachedKey) return this.cachedKey;

        const rawKey = process.env[ENCRYPTION_KEY_ENV];
        if (!rawKey) {
            throw new Error(`${ENCRYPTION_KEY_ENV} is not set`);
        }

        let key: Buffer | undefined;

        if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
            key = Buffer.from(rawKey, "hex");
        } else {
            const base64Key = Buffer.from(rawKey, "base64");
            if (base64Key.length === 32) {
                key = base64Key;
            } else if (rawKey.length === 32) {
                key = Buffer.from(rawKey, "utf8");
            }
        }

        if (!key || key.length !== 32) {
            throw new Error(`${ENCRYPTION_KEY_ENV} must be 32 bytes (hex, base64, or raw)`);
        }

        this.cachedKey = key;
        return key;
    }

    isEncrypted(value: string): boolean {
        return value.startsWith(`${ENCRYPTION_PREFIX}.`);
    }

    encryptText(plainText: string): string {
        const iv = crypto.randomBytes(IV_LENGTH_BYTES);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.getKey(), iv);
        const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
        const tag = cipher.getAuthTag();

        return [
            ENCRYPTION_PREFIX,
            iv.toString("base64"),
            tag.toString("base64"),
            encrypted.toString("base64"),
        ].join(".");
    }

    decryptText(payload: string): string {
        const parts = payload.split(".");
        if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
            throw new Error("Invalid encrypted payload format");
        }

        const iv = Buffer.from(parts[2], "base64");
        const tag = Buffer.from(parts[3], "base64");
        const encrypted = Buffer.from(parts[4], "base64");

        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.getKey(), iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

        return decrypted.toString("utf8");
    }

    encryptJson<T>(value: T): string {
        return this.encryptText(JSON.stringify(value));
    }

    decryptJson<T>(payload: string): T {
        return JSON.parse(this.decryptText(payload)) as T;
    }

    encryptOptionalText(value: Nullable<string>): Nullable<string> {
        if (value === null || value === undefined) return value;
        return this.encryptText(value);
    }

    decryptOptionalText(value: Nullable<string>): Nullable<string> {
        if (value === null || value === undefined) return value;
        return this.isEncrypted(value) ? this.decryptText(value) : value;
    }

    encryptFields<T extends Record<string, unknown>>(input: T, fields: Array<keyof T>): T {
        const result = { ...input };
        for (const field of fields) {
            const value = result[field];
            if (typeof value === "string") {
                result[field] = this.encryptText(value) as T[typeof field];
            }
        }
        return result;
    }

    decryptFields<T extends Record<string, unknown>>(input: T, fields: Array<keyof T>): T {
        const result = { ...input };
        for (const field of fields) {
            const value = result[field];
            if (typeof value === "string" && this.isEncrypted(value)) {
                result[field] = this.decryptText(value) as T[typeof field];
            }
        }
        return result;
    }

    encryptMany<T extends Record<string, unknown>>(items: T[], fields: Array<keyof T>): T[] {
        return items.map((item) => this.encryptFields(item, fields));
    }

    decryptMany<T extends Record<string, unknown>>(items: T[], fields: Array<keyof T>): T[] {
        return items.map((item) => this.decryptFields(item, fields));
    }
}

export const encryptionService = new EncryptionService();
