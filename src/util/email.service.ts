import { DoubleZero } from '00-js';
import { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { logService } from '../routes/log-service/log-service.service';
import axios from 'axios';

export type EmailAttachment = {
    /** Dateiname inkl. Endung, z.B. "Mahnung-RG-2024-001.pdf" */
    filename: string;
    /** MIME-Type, z.B. "application/pdf" */
    content_type: string;
    /** Base64-kodierter Dateiinhalt */
    content: string;
};

export class EmailService {
    private doubleZero?: DoubleZero;

    private ensureInitialized(): void {
        if (!this.doubleZero) {
            const token = process.env.DOUBLE_ZERO_API_KEY;
            const baseUrl = process.env.DOUBLE_ZERO_API_ROUTE;
            const from = process.env.EMAIL_FROM;

            if (!token || !baseUrl || !from) {
                throw new Error('❌ Missing required environment variables for email service.');
            }

            this.doubleZero = new DoubleZero({ token, baseUrl });
        }
    }

    /**
     * Validates if the given string is a plausible email address.
     * Checks for:
     * - Exactly one '@'
     * - At least one '.' after the '@'
     * - Reasonable local and domain part lengths
     * - Allowed characters in local and domain parts
     * - TLD of at least 2 characters (e.g., .de, .com)
     */
    validateEmail(email: string): boolean {
        if (typeof email !== 'string' || email.length > 320) return false;

        // Must contain exactly one '@'
        const atIndex = email.indexOf('@');
        if (atIndex === -1 || atIndex !== email.lastIndexOf('@')) return false;

        const [local, domain] = email.split('@');
        if (!local || !domain) return false;

        // Local part: max 64 chars, no spaces, allowed chars
        if (local.length > 64 || /\s/.test(local)) return false;
        if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;

        // Domain part: max 255 chars, at least one dot, no spaces, allowed chars
        if (domain.length > 255 || /\s/.test(domain)) return false;
        if (domain.indexOf('.') === -1) return false;
        if (!/^[a-zA-Z0-9.-]+$/.test(domain)) return false;

        // No consecutive dots or hyphens in domain
        if (/(\.\.|--)/.test(domain)) return false;

        // TLD check: at least 2 chars, only letters
        const tld = domain.split('.').pop();
        if (!tld || tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;

        return true;
    }

    renderReactComponent(body: ReactElement): string {
        return renderToStaticMarkup(body);
    }

    async sendEmail(to: string, subject: string, html: string): Promise<string> {
        try {
            if (!this.validateEmail(to)) {
                throw new Error(`❌ Invalid email address: ${to}`);
            }

            this.ensureInitialized();

            if (!this.doubleZero || !process.env.EMAIL_FROM) {
                throw new Error('❌ Email service not properly initialized.');
            }

            const response = await this.doubleZero.emails.send({
                from: process.env.EMAIL_FROM,
                to: [to],
                subject,
                html,
            });

            const messageId = response?.id;
            if (!messageId) {
                console.warn('⚠️ No message ID returned from email service');
                throw new Error('No message ID received after sending email');
            }


            console.log(`✅ Email sent to ${to} with message ID: ${messageId}`);
            return messageId;
        } catch (error: any) {
            console.error('❌ Failed to send email:', error.response?.data || error.message);
            await logService.error('Failed to send email', {
                error: error.message,
                to,
                subject,
            });
            throw new Error('Failed to send email');
        }
    }

    /**
     * Versendet eine E-Mail mit Datei-Anhang (z.B. PDF-Mahnschreiben).
     *
     * @param to           Empfänger-E-Mail-Adresse
     * @param subject      Betreff
     * @param html         HTML-Body
     * @param attachments  Liste von Anhängen (base64-kodiert)
     * @param options.replyTo  Antwort-Adresse (z.B. E-Mail der rechnungsstellenden Firma)
     *                         So kann der Empfänger direkt bei der Firma antworten
     */
    async sendEmailWithAttachment(
        to: string,
        subject: string,
        html: string,
        attachments: EmailAttachment[],
        options?: { replyTo?: string }
    ): Promise<string> {
        try {
            if (!this.validateEmail(to)) {
                throw new Error(`❌ Ungültige Empfänger-E-Mail-Adresse: ${to}`);
            }
            if (options?.replyTo && !this.validateEmail(options.replyTo)) {
                throw new Error(`❌ Ungültige Reply-To E-Mail-Adresse: ${options.replyTo}`);
            }

            this.ensureInitialized();

            if (!this.doubleZero || !process.env.EMAIL_FROM) {
                throw new Error('❌ Email Service nicht initialisiert.');
            }

            const response = await this.doubleZero.emails.send({
                from: process.env.EMAIL_FROM,
                to: [to],
                subject,
                html,
                reply_to: options?.replyTo ?? undefined,
                attachments: attachments.map((a) => ({
                    filename: a.filename,
                    content: a.content,
                    content_type: a.content_type,
                })),
            });

            const messageId = response?.id;
            if (!messageId) {
                throw new Error('Keine Message-ID vom E-Mail-Service erhalten');
            }

            console.log(`✅ E-Mail mit Anhang versendet an ${to} (ID: ${messageId}, Anhänge: ${attachments.length})`);
            return messageId;
        } catch (error: any) {
            console.error('❌ E-Mail mit Anhang fehlgeschlagen:', error.response?.data || error.message);
            await logService.error('Failed to send email with attachment', {
                error: error.message,
                to,
                subject,
                attachmentCount: attachments.length,
            });
            throw new Error('Failed to send email with attachment');
        }
    }

    async getMessageStatus(messageId: string): Promise<{
        id: string;
        status: string;
    }> {
        this.ensureInitialized();

        if (!this.doubleZero) throw new Error("❌ Email service not properly initialized.");

        const baseUrl = process.env.DOUBLE_ZERO_API_ROUTE?.replace(/\/$/, "");
        const token = process.env.DOUBLE_ZERO_API_KEY;

        if (!baseUrl) throw new Error("❌ DOUBLE_ZERO_API_ROUTE not set");
        if (!token) throw new Error("❌ DOUBLE_ZERO_API_KEY not set");
        if (!messageId) throw new Error("❌ Message ID is required");

        const url = `${baseUrl}/api/emails/${messageId}/messages`;
        console.log(`📡 Fetching email message info from: ${url}`);

        try {
            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
            });

            const messages = response.data?.data;
            if (!Array.isArray(messages) || messages.length === 0) {
                throw new Error("❌ No message history found for this ID");
            }

            const lastMessage = messages[messages.length - 1];

            const result = {
                id: lastMessage.id,
                status: lastMessage.status || "unknown",
            };


            return result;
        } catch (error: any) {
            const statusCode = error?.response?.status;
            const errorData = error?.response?.data;

            await logService.error("❌ Error fetching email message status", {
                messageId,
                statusCode,
                hint: statusCode === 404
                    ? "Nachricht wurde nicht gefunden – ist die ID korrekt?"
                    : "Prüfe API-Key, Netzwerk oder URL",
            });

            console.error("❌ Axios Error:", error.message);
            if (statusCode) {
                console.error("Status:", statusCode);
                console.error("Data:", errorData);
            }

            throw new Error("Failed to fetch message status");
        }
    }






}

export const emailService = new EmailService();