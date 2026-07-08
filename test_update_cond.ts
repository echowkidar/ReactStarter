import { eq, and } from "drizzle-orm";
import { db } from "./server/db";
import { dispatchRecipients } from "./shared/schema";

async function main() {
  try {
    const dispatchId = 4; // replace with actual
    const departmentId = 1; // replace with actual

    const [recipientRow] = await db
        .select()
        .from(dispatchRecipients)
        .where(
          and(
            eq(dispatchRecipients.dispatchId, dispatchId)
            // eq(dispatchRecipients.departmentId, departmentId) // I'll just check what dept it belongs to
          )
        );
        
    console.log("Recipient row:", recipientRow);

    if (recipientRow) {
      await db
        .update(dispatchRecipients)
        .set({ 
          status: "received", 
          receivedAt: new Date(),
          inwardNumber: "TEST-456" 
        })
        .where(
          and(
            eq(dispatchRecipients.dispatchId, dispatchId),
            eq(dispatchRecipients.departmentId, recipientRow.departmentId!)
          )
        );
      console.log("Update executed");
    }

  } catch (error: any) {
    console.error("Error:", error.message);
  }
  process.exit(0);
}

main();
