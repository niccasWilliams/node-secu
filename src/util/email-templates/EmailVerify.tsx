import * as React from "react";
import { Button, Heading, Hr, Html, Section, Text } from "@react-email/components";
import { EmailSignature } from "./EmailSignature";

export interface EmailVerifyProps {
    verifyUrl: string;
    recipientName?: string | null;
    expiresInHours: number;
}

const wrapper: React.CSSProperties = {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    backgroundColor: "#f9fafb",
    padding: "32px 16px",
};

const card: React.CSSProperties = {
    maxWidth: 520,
    margin: "0 auto",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: "32px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const button: React.CSSProperties = {
    backgroundColor: "#EAAC3F",
    color: "#1f2937",
    padding: "12px 24px",
    borderRadius: 8,
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-block",
};

export const EmailVerify = ({ verifyUrl, recipientName, expiresInHours }: EmailVerifyProps) => (
    <Html>
        <Section style={wrapper}>
            <Section style={card}>
                <Heading style={{ fontSize: 22, color: "#1f2937", marginTop: 0 }}>
                    {recipientName ? `Hallo ${recipientName},` : "Hallo,"}
                </Heading>
                <Text style={{ fontSize: 15, color: "#374151", lineHeight: 1.6 }}>
                    bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.
                    Klicke dazu auf den folgenden Button:
                </Text>
                <Section style={{ textAlign: "center", margin: "24px 0" }}>
                    <Button href={verifyUrl} style={button}>E-Mail bestätigen</Button>
                </Section>
                <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
                    Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
                </Text>
                <Text style={{ fontSize: 12, color: "#4b5563", wordBreak: "break-all" }}>
                    {verifyUrl}
                </Text>
                <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 16 }}>
                    Der Link ist {expiresInHours} Stunden gültig. Wenn du dich nicht
                    registriert hast, kannst du diese Mail ignorieren.
                </Text>
                <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
                <EmailSignature />
            </Section>
        </Section>
    </Html>
);

export default EmailVerify;
