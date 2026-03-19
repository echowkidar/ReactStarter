import { db } from "./server/db";
import { usefulDownloads } from "./shared/schema";

async function main() {
    try {
        console.log("Testing db.insert...");
        const [newDownload] = await db.insert(usefulDownloads).values({
            title: "Test File",
            description: "Testing",
            fileUrl: null,
            externalLink: "https://example.com",
            thumbnailUrl: null
        }).returning();

        console.log("Created successfully:", newDownload);

        console.log("Testing JSON.stringify...");
        console.log("JSON:", JSON.stringify(newDownload));

        console.log("Testing db.select...");
        const downloads = await db.select().from(usefulDownloads);
        console.log("Selected:", JSON.stringify(downloads));

        process.exit(0);
    } catch (error) {
        console.error("Error occurred:");
        console.error(error);
        process.exit(1);
    }
}
main();
