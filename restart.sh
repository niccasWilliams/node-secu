#!/bin/bash

# Farben für Output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛡️  Node-Secu Restart Sequence Initiated...${NC}"

# 1. Dependencies checken (schnell)
echo -e "${BLUE}📦 Checking dependencies...${NC}"
pnpm install --frozen-lockfile

# 2. PM2 Prozess neu starten (npx pm2, da nicht global installiert)
echo -e "${BLUE}🔄 Flushing logs & Reloading PM2 process...${NC}"

# Alte Logs löschen für sauberen Start
npx pm2 flush

# Check if process runs via npx pm2 list
if npx pm2 list | grep -q "node-secu"; then
    npx pm2 reload node-secu
else
    npx pm2 start ecosystem.config.js
fi

# 3. Status Check
echo -e "${GREEN}✅ Node-Secu is active!${NC}"
echo -e "${BLUE}📜 Tailing logs (Ctrl+C to exit logs, process keeps running)...${NC}"

# 4. Logs anzeigen
npx pm2 logs node-secu --lines 20
