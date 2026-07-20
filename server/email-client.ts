import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { eq, and } from 'drizzle-orm';
import { db } from './db';
import { userEmails } from '../shared/schema';

// ─── In-Memory Cache ────────────────────────────────────────────────────────
// Cache inbox/sent lists for 2 minutes, individual messages for 10 minutes.
// This eliminates repeated IMAP connections on every click.

interface CachedItem<T> {
  data: T;
  timestamp: number;
}

const inboxCache = new Map<string, CachedItem<any[]>>();
const sentCache = new Map<string, CachedItem<any[]>>();
const messageCache = new Map<string, CachedItem<any>>();
const unreadCountCache = new Map<string, CachedItem<number>>(); // ✅ NEW: unread count cache

const INBOX_CACHE_TTL = 2 * 60 * 1000;   // 2 minutes
const MESSAGE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const UNREAD_CACHE_TTL = 2 * 60 * 1000;  // 2 minutes — matches frontend poll interval

function getCacheKey(userId: string, userType: string, extra?: string) {
  return `${userType}:${userId}${extra ? ':' + extra : ''}`;
}

function isCacheValid<T>(item: CachedItem<T> | undefined, ttl: number): item is CachedItem<T> {
  return !!item && (Date.now() - item.timestamp) < ttl;
}

// ─── IMAP Client ────────────────────────────────────────────────────────────

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

// ─── Inbox (with cache) ─────────────────────────────────────────────────────

export async function getInbox(userId: string, userType: string) {
  const cacheKey = getCacheKey(userId, userType, 'inbox');
  const cached = inboxCache.get(cacheKey);
  if (isCacheValid(cached, INBOX_CACHE_TTL)) {
    return cached.data;
  }

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

        for await (let message of client.fetch(`${start}:*`, { envelope: true, flags: true })) {
          if (message.flags && message.flags.has('\\Deleted')) {
            continue;
          }
          messages.push({
            id: message.uid,
            seq: message.seq,
            subject: message.envelope.subject,
            from: message.envelope.from,
            date: message.envelope.date,
            read: message.flags ? message.flags.has('\\Seen') : false,
            starred: message.flags ? message.flags.has('\\Flagged') : false,
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  
  const result = messages.reverse(); // Newest first
  inboxCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

// ─── Unread Count ───────────────────────────────────────────────────────────

export async function getUnreadCount(userId: string, userType: string) {
  const cacheKey = getCacheKey(userId, userType, 'unread');

  // ✅ Return cached result if still fresh — avoids IMAP connection on every poll
  const cached = unreadCountCache.get(cacheKey);
  if (isCacheValid(cached, UNREAD_CACHE_TTL)) {
    return cached.data;
  }

  const { client } = await getImapClient(userId, userType);
  await client.connect();

  let unreadCount = 0;
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const status = await client.status('INBOX', { unseen: true });
      if (status && typeof status.unseen === 'number') {
        unreadCount = status.unseen;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  // ✅ Store result in cache
  unreadCountCache.set(cacheKey, { data: unreadCount, timestamp: Date.now() });
  return unreadCount;
}

// ─── Get Single Message (with cache) ────────────────────────────────────────

export async function getMessage(userId: string, userType: string, uid: number, folder: string = 'INBOX') {
  const cacheKey = getCacheKey(userId, userType, `msg:${folder}:${uid}`);
  const cached = messageCache.get(cacheKey);
  if (isCacheValid(cached, MESSAGE_CACHE_TTL)) {
    return cached.data;
  }

  const { client } = await getImapClient(userId, userType);
  await client.connect();

  let messageData = null;
  try {
    const lock = await client.getMailboxLock(folder);
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

  if (messageData) {
    messageCache.set(cacheKey, { data: messageData, timestamp: Date.now() });
  }

  return messageData;
}

// ─── Sent Mail (with cache) ─────────────────────────────────────────────────

export async function getSentMail(userId: string, userType: string) {
  const cacheKey = getCacheKey(userId, userType, 'sent');
  const cached = sentCache.get(cacheKey);
  if (isCacheValid(cached, INBOX_CACHE_TTL)) {
    return cached.data;
  }

  const { client } = await getImapClient(userId, userType);
  await client.connect();

  const messages: any[] = [];
  try {
    const lock = await client.getMailboxLock('[Gmail]/Sent Mail');
    try {
      const status = await client.status('[Gmail]/Sent Mail', { messages: true });
      if (status && status.messages > 0) {
        const totalMessages = status.messages;
        const start = Math.max(1, totalMessages - 49); 

        for await (let message of client.fetch(`${start}:*`, { envelope: true, flags: true })) {
          if (message.flags && message.flags.has('\\Deleted')) {
            continue;
          }
          messages.push({
            id: message.uid,
            seq: message.seq,
            subject: message.envelope.subject,
            from: message.envelope.from,
            to: message.envelope.to,
            date: message.envelope.date,
            folder: '[Gmail]/Sent Mail',
            read: message.flags ? message.flags.has('\\Seen') : false,
            starred: message.flags ? message.flags.has('\\Flagged') : false,
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch sent mail. Folder might be named differently.", e);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  
  const result = messages.reverse();
  sentCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

// ─── Delete Message ─────────────────────────────────────────────────────────

export async function deleteMessage(userId: string, userType: string, uid: number, folder: string = 'INBOX') {
  const { client } = await getImapClient(userId, userType);
  await client.connect();

  try {
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageFlagsAdd(uid.toString(), ['\\Deleted'], { uid: true });
      
      let trashPath = '[Gmail]/Trash';
      try {
        const mailboxes = await client.list();
        const trashBox = mailboxes.find(mb => mb.specialUse === '\\Trash' || mb.name.toLowerCase().includes('trash') || mb.name.toLowerCase().includes('bin'));
        if (trashBox) {
          trashPath = trashBox.path;
        }
      } catch (e) {
        // ignore list error
      }

      try {
        await client.messageMove(uid.toString(), trashPath, { uid: true });
      } catch (e) {
        console.error("Message move to trash failed", e);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  // Invalidate caches for this user
  const inboxKey = getCacheKey(userId, userType, 'inbox');
  const sentKey = getCacheKey(userId, userType, 'sent');
  const msgKey = getCacheKey(userId, userType, `msg:${folder}:${uid}`);
  inboxCache.delete(inboxKey);
  sentCache.delete(sentKey);
  messageCache.delete(msgKey);
}

// ─── Toggle Flag ────────────────────────────────────────────────────────────

export async function toggleEmailFlag(userId: string, userType: string, uid: number, folder: string, flag: string, value: boolean) {
  const { client } = await getImapClient(userId, userType);
  await client.connect();

  try {
    const lock = await client.getMailboxLock(folder);
    try {
      if (value) {
        await client.messageFlagsAdd(uid.toString(), [flag], { uid: true });
      } else {
        await client.messageFlagsRemove(uid.toString(), [flag], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  // Invalidate inbox/sent cache so flag changes show up
  const inboxKey = getCacheKey(userId, userType, 'inbox');
  const sentKey = getCacheKey(userId, userType, 'sent');
  inboxCache.delete(inboxKey);
  sentCache.delete(sentKey);
}

// ─── Background Prefetch (called on login) ──────────────────────────────────
// Fetches inbox list + latest 30 message contents in a SINGLE IMAP connection.
// Does NOT block the UI, runs silently in the background.
// Uses connection pooling and strict caching to avoid overloading IMAP server.
export async function prefetchEmails(userId: string, userType: string) {
  try {
    const lockKey = `prefetch:${userType}:${userId}`;
    const lock = getPrefetchLock(lockKey);
    
    // Acquire lock, wait max 0ms (if already locked, fail immediately)
    await lock.acquire(0);
    
    const PREFETCH_MESSAGE_COUNT = 30;

    try {
      const { client } = await getImapClient(userId, userType);
      await client.connect();

      const messages: any[] = [];
      const lock = await client.getMailboxLock('INBOX');
      try {
        // Step 1: Fetch inbox list (envelope + flags only — fast)
        const status = await client.status('INBOX', { messages: true });
        if (status && status.messages > 0) {
          const totalMessages = status.messages;
          const start = Math.max(1, totalMessages - 49);

          for await (let message of client.fetch(`${start}:*`, { envelope: true, flags: true })) {
            if (message.flags && message.flags.has('\\Deleted')) {
              continue;
            }
            messages.push({
              id: message.uid,
              seq: message.seq,
              subject: message.envelope.subject,
              from: message.envelope.from,
              date: message.envelope.date,
              read: message.flags ? message.flags.has('\\Seen') : false,
              starred: message.flags ? message.flags.has('\\Flagged') : false,
            });
          }
        }

        // Cache inbox list (newest first)
        const inboxResult = [...messages].reverse();
        const inboxKey = getCacheKey(userId, userType, 'inbox');
        inboxCache.set(inboxKey, { data: inboxResult, timestamp: Date.now() });

        // Step 2: Fetch full content of the latest 30 messages
        const latestUIDs = inboxResult.slice(0, PREFETCH_MESSAGE_COUNT).map(m => m.id);
        const uidsToFetch = latestUIDs.filter(uid => {
          const msgCacheKey = getCacheKey(userId, userType, `msg:INBOX:${uid}`);
          return !isCacheValid(messageCache.get(msgCacheKey), MESSAGE_CACHE_TTL);
        });

        if (uidsToFetch.length > 0) {
          const sequenceString = uidsToFetch.join(',');
          const parsePromises = [];

          try {
            for await (let msg of client.fetch(sequenceString, { source: true, envelope: true }, { uid: true })) {
              if (msg && msg.source) {
                // Parse concurrently
                parsePromises.push((async () => {
                  try {
                    const parsed = await simpleParser(msg.source);
                    const attachments = parsed.attachments.map(att => ({
                      filename: att.filename,
                      contentType: att.contentType,
                      size: att.size,
                      content: att.content ? att.content.toString('base64') : null
                    }));

                    let toList: any[] = [];
                    if (parsed.to) {
                      if (Array.isArray(parsed.to)) {
                        toList = parsed.to.flatMap(t => t.value);
                      } else {
                        toList = parsed.to.value;
                      }
                    } else {
                      toList = msg.envelope.to || [];
                    }

                    const messageData = {
                      id: msg.uid,
                      subject: msg.envelope.subject,
                      from: msg.envelope.from,
                      to: toList,
                      date: msg.envelope.date,
                      body: parsed.text || "",
                      html: parsed.html || "",
                      attachments,
                    };

                    const msgCacheKey = getCacheKey(userId, userType, `msg:INBOX:${msg.uid}`);
                    messageCache.set(msgCacheKey, { data: messageData, timestamp: Date.now() });
                  } catch (err) {
                    console.error(`[Prefetch] Failed to parse message UID ${msg.uid}:`, err);
                  }
                })());
              }
            }
            // Wait for all concurrent parsings to finish
            await Promise.all(parsePromises);
          } catch (err) {
            console.error(`[Prefetch] Bulk fetch failed:`, err);
          }
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    console.log(`[Prefetch] Completed for ${userType}:${userId} — ${messages.length} inbox items, up to ${PREFETCH_MESSAGE_COUNT} messages cached`);
  } catch (error) {
    // Prefetch failure is non-critical — user can still fetch on demand
    console.error(`[Prefetch] Failed for ${userType}:${userId}:`, error);
  }
}
