// APP CONFIGURATION
// This file contains app-specific configuration
// Customize this file for each new app created from the template

import { Languages } from "@/types/types";

export const IS_LIVE = false;
export const APP_ID = "node-template";
export const S3_BASE_PATH = `apps/${APP_ID}`;

// BRANDING
export const LOGO_PATH_SVG = "/public/logo-full.svg"; // Path to the logo image, used in emails and notifications
export const LOGO_PATH = "/public/logo-full.png";


// CONTACT
export const SUPPORT_EMAIL = "support@orvello.de"
export const MISSING_EMAIL_FALLBACK = "support@orvello.de"
export const ADMIN_EMAILS = ["niclaspilz@gmail.com"];


// LOCALIZATION
export const APP_TIME_ZONE = "Europe/Berlin";
export const SUPPORTED_LANGUAGES: Languages[] = ["DE", "EN", "FR", "ES"];
export const appCountryTAG = "DE";   //ALSO APP LANGUAGE 
export const APP_LANGUAGE: Languages = "DE";



export const SUBSCRIPTION_MANAGE_URL = `${process.env.FRONTEND_HOST_NAME}/user/subscription`;
