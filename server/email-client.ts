import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { eq, and } from 'drizzle-orm';
import { db } from './db';
import { userEmails } from '../shared/schema';

export async function getImapClient(userId: string, userType: string) {
  const [record] = await db.select().from(userEmails)
    .where(and(eq(userEmails.userId, userId), eq(userEmails.userType, userType)));
  
  if (!record) throw new Error("Email configuration not found.");

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: record.email,
      pass: record.appPassword
    },
    logger: false,
  });

  return { client, record };
}

export async function getSmtpTransporter(userId: string, userType: string) {
  const [record] = await db.select().from(userEmails)
    .where(and(eq(userEmails.userId, userId), eq(userEmails.userType, userType)));
    
  if (!record) throw new Error("Email configuration not found.");

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: record.email,
      pass: record.appPassword
    }
  });

  return { transporter, record };
}

export async function getInbox(userId: string, userType: string) {
  const { client } = await getImapClient(userId, userType);
  await client.connect();

  const messages: any[] = [];
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const status = await client.status('INBOX', { messages: true });
      if (status && status.messages > 0) {
        const totalMessages = status.messages;
        const start = Math.max(1, totalMessages - 49); 

        for await (let message of client.fetch(`${start}:*`, { envelope: true })) {
          messages.push({
            id: message.uid,
            seq: message.seq,
            subject: message.envelope.subject,
            from: message.envelope.from,
            date: message.envelope.date,
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  
  return messages.reverse(); // Newest first
}

export async function getMessage(userId: string, userType: string, uid: number) {
  const { client } = await getImapClient(userId, userType);
  await client.connect();

  let messageData = null;
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const msg = await client.fetchOne(uid.toString(), { source: true, envelope: true }, { uid: true });
      if (msg) {
        let bodyText = "";
        let htmlText = "";
        let attachments: any[] = [];
        let toList: any[] = [];
        if (msg.source) {
          const parsed = await simpleParser(msg.source);
          bodyText = parsed.text || "";
          htmlText = parsed.html || "";
          
          attachments = parsed.attachments.map(att => ({
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
            content: att.content ? att.content.toString('base64') : null
          }));

          if (parsed.to) {
            if (Array.isArray(parsed.to)) {
              toList = parsed.to.flatMap(t => t.value);
            } else {
              toList = parsed.to.value;
            }
          } else {
            toList = msg.envelope.to || [];
          }
        }

        messageData = {
          id: msg.uid,
          subject: msg.envelope.subject,
          from: msg.envelope.from,
          to: toList,
          date: msg.envelope.date,
          body: bodyText,
          html: htmlText,
          attachments,
        };
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return messageData;
}
