import "dotenv/config";
import { pg } from "./index";

import { seedUserLeads } from "./userSeeds";
import { individualSeed } from "./individual/individual-seed";
import { individualUserSeed } from "./individual/individual-user-seeds";


async function main() {
  try {
    console.log("🌱 Seeding data...");

    await seedUserLeads(); 
    await individualUserSeed();
    await individualSeed();     //  <= HIER BITTE INDIVIDUALE SEEDS EINFÜGEN

    //bitte hier wenn möglich keine neuen seeds hinzufügen,
    //diese datei wird durch das template geupdated,
    //=> für individuelle seeds bitte in den individual ordner gehen


    console.log("✅ Database seeded successfully");
  } catch (err) {
    console.error("❌ Error during seeding:", err);
  } finally {
    await pg.end();
    console.log("Database connection closed.");
  }
}

main();