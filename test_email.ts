import { getImapClient } from './server/email-client.js';
import { db } from './server/db.js';
import { userEmails } from './shared/schema.js';
import { simpleParser } from 'mailparser';

async function testFetch() {
  try {
    const { client } = await getImapClient("323", "department");
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    try {
      const status = await client.status('INBOX', { messages: true });
      const start = Math.max(1, status.messages - 10);
      
      for await (let msg of client.fetch(`${start}:*`, { envelope: true, source: true })) {
        if (msg.envelope.subject.includes("Retirement Gratuity")) {
          console.log("Found message:", msg.envelope.subject);
          const parsed = await simpleParser(msg.source);
          console.log("Has Text:", !!parsed.text);
          console.log("Has HTML:", !!parsed.html);
          if (parsed.html) {
             console.log("HTML length:", parsed.html.length);
             console.log("HTML snippet:", parsed.html.substring(0, 500));
          }
          if (parsed.text) {
             console.log("Text length:", parsed.text.length);
             console.log("Text snippet:", parsed.text.substring(0, 500));
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    console.log("Done");
  } catch (err) {
    console.error(err);
  }
}

testFetch();
