import { database } from "@/db";


export async function individualSeed() {
    await database.transaction(async (trx) => {
      


        
    });

    console.log(`✅ Individual leads seeded.`);
}