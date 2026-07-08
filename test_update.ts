import { eq } from "drizzle-orm";
import { db } from "./server/db";
import { dispatchRecipients } from "./shared/schema";

async function main() {
  try {
    await db
      .update(dispatchRecipients)
      .set({ inwardNumber: "TEST-123" })
      .where(eq(dispatchRecipients.id, 6)); // We know id 6 exists
    console.log("Update successful");
  } catch (error: any) {
    console.error("Error:", error.message);
  }
  process.exit(0);
}

main();
