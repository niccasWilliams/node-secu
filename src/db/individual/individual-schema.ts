// INDIVIDUAL SCHEMA
// Add your app-specific database tables here
// This file is NOT synced with the template

import {
    boolean,
    index,
    integer,
    pgEnum,
    pgTable,
    serial,
    text,
    timestamp,
    unique,
    numeric,
    jsonb,
    varchar,
    pgSequence,
    uniqueIndex,
    date,
} from "drizzle-orm/pg-core";
import { users } from "../schema";
import { APP_LANGUAGE } from "@/app.config";
import { eq, sql } from "drizzle-orm";


