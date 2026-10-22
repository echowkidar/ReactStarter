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
// Gmail allows only ~15 simultaneous IMAP connections per account. Earlier every
// request (unread-count poll, inbox, message, prefetch) opened its own connection,
// so parallel requests hit "Too many simultaneous connections". Now:
//   1. withImap(): max IMAP_MAX_PER_ACCOUNT connections per Gmail account at a
//      time (others wait in a queue), always logged out / closed afterwards.
//   2. singleFlight(): identical concurrent read requests share ONE IMAP call.
//   3. An 'error' listener on every client, so a socket error can never become
//      an unhandled 'error' event that crashes the Node process.

const IMAP_MAX_PER_ACCOUNT = 2;
const IMAP_QUEUE_TIMEOUT_MS = 60 * 1000;

const accountSlots = new Map<string, { active: number; queue: Array<() => void> }>();

async function acquireAccountSlot(account: string): Promise<() => void> {
  let slot = accountSlots.get(account);
  if (!slot) {
    slot = { active: 0, queue: [] };
    accountSlots.set(account, slot);
  }
  const s = slot;
  if (s.active >= IMAP_MAX_PER_ACCOUNT) {
    await new Promise<void>((resolve, reject) => {
      const grant = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const i = s.queue.indexOf(grant);
        if (i >= 0) s.queue.splice(i, 1);
        reject(new Error("Mail server is busy. Please try again in a moment."));
      }, IMAP_QUEUE_TIMEOUT_MS);
      s.queue.push(grant);
    });
    // the releasing caller handed its slot over to us (active not decremented)
  } else {
    s.active++;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = s.queue.shift();
    if (next) {
      next(); // hand the slot over
    } else {
      s.active--;
      if (s.active <= 0 && s.queue.length === 0) accountSlots.delete(account);
    }
  };
}

const inflight = new Map<string, Promise<any>>();

/** Concurrent calls with the same key share one running promise. */
function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = (async () => {
    try {
      return await fn();
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

async function getEmailRecord(userId: string, userType: string) {
  const [record] = await db.select().from(userEmails)
    .where(and(eq(userEmails.userId, userId), eq(userEmails.userType, userType)));
  if (!record) throw new Error("Email configuration not found.");
  return record;
}

function createImapClient(record: { email: string; appPassword: string }) {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: record.email,
      pass: record.appPassword
    },
    logger: false,
    connectionTimeout: 20 * 1000,
    greetingTimeout: 15 * 1000,
    socketTimeout: 2 * 60 * 1000,
  });
  // Without a listener, an emitted 'error' (e.g. socket timeout) would crash the process
  client.on('error', (err: any) => {
    console.error(`[IMAP] ${record.email}: ${err?.code || ''} ${err?.message || err}`);
  });
  return client;
}

export async function getImapClient(userId: string, userType: string) {
  const record = await getEmailRecord(userId, userType);
  const client = createImapClient(record);
  return { client, record };
}

/** Runs fn with a connected IMAP client; limits connections per account and always cleans up. */
async function withImap<T>(userId: string, userType: string, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const record = await getEmailRecord(userId, userType);
  const release = await acquireAccountSlot(record.email.toLowerCase());
  const client = createImapClient(record);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    try {
      if (client.usable) {
        await client.logout();
      } else {
        client.close();
      }
    } catch {
      try { client.close(); } catch { /* ignore */ }
    }
    release();
  }
}

export async function getSmtpTransporter(userId: string, userType: string) {
  const record = await getEmailRecord(userId, userType);

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

// ─── Shared fetch helpers ───────────────────────────────────────────────────

async function fetchMailboxList(client: ImapFlow, mailbox: string, extra: Record<string, any> = {}, withTo = false) {
  const messages: any[] = [];
  const lock = await client.getMailboxLock(mailbox);
  try {
    const status = await client.status(mailbox, { messages: true });
    if (status && status.messages && status.messages > 0) {
      const totalMessages = status.messages;
      const start = Math.max(1, totalMessages - 49);

      for await (const message of client.fetch(`${start}:*`, { envelope: true, flags: true })) {
        if (message.flags && message.flags.has('\\Deleted')) {
          continue;
        }
        messages.push({
          id: message.uid,
          seq: message.seq,
          subject: message.envelope?.subject,
          from: message.envelope?.from,
          ...(withTo ? { to: message.envelope?.to } : {}),
          date: message.envelope?.date,
          ...extra,
          read: message.flags ? message.flags.has('\\Seen') : false,
          starred: message.flags ? message.flags.has('\\Flagged') : false,
        });
      }
    }
  } finally {
    lock.release();
  }
  return messages.reverse(); // Newest first
}

async function parseMessage(msg: any) {
  let bodyText = "";
  let htmlText: any = "";
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
      toList = msg.envelope?.to || [];
    }
  }

  return {
    id: msg.uid,
    subject: msg.envelope?.subject,
    from: msg.envelope?.from,
    to: toList,
    date: msg.envelope?.date,
    body: bodyText,
    html: htmlText,
    attachments,
  };
}

// ─── Inbox (with cache) ─────────────────────────────────────────────────────

export async function getInbox(userId: string, userType: string) {
  const cacheKey = getCacheKey(userId, userType, 'inbox');
  const cached = inboxCache.get(cacheKey);
  if (isCacheValid(cached, INBOX_CACHE_TTL)) {
    return cached.data;
  }

  return singleFlight(cacheKey, async () => {
    const result = await withImap(userId, userType, (client) => fetchMailboxList(client, 'INBOX'));
    inboxCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  });
}

// ─── Unread Count ───────────────────────────────────────────────────────────

export async function getUnreadCount(userId: string, userType: string) {
  const cacheKey = getCacheKey(userId, userType, 'unread');

  // Return cached result if still fresh — avoids IMAP connection on every poll
  const cached = unreadCountCache.get(cacheKey);
  if (isCacheValid(cached, UNREAD_CACHE_TTL)) {
    return cached.data;
  }

  return singleFlight(cacheKey, async () => {
    const unreadCount = await withImap(userId, userType, async (client) => {
      // STATUS does not need a mailbox lock / SELECT
      const status = await client.status('INBOX', { unseen: true });
      return status && typeof status.unseen === 'number' ? status.unseen : 0;
    });
    unreadCountCache.set(cacheKey, { data: unreadCount, timestamp: Date.now() });
    return unreadCount;
  });
}

// ─── Get Single Message (with cache) ────────────────────────────────────────

export async function getMessage(userId: string, userType: string, uid: number, folder: string = 'INBOX') {
  const cacheKey = getCacheKey(userId, userType, `msg:${folder}:${uid}`);
  const cached = messageCache.get(cacheKey);
  if (isCacheValid(cached, MESSAGE_CACHE_TTL)) {
    return cached.data;
  }

  return singleFlight(cacheKey, async () => {
    const messageData = await withImap(userId, userType, async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const msg = await client.fetchOne(uid.toString(), { source: true, envelope: true }, { uid: true });
        return msg ? await parseMessage(msg) : null;
      } finally {
        lock.release();
      }
    });

    if (messageData) {
      messageCache.set(cacheKey, { data: messageData, timestamp: Date.now() });
    }
    return messageData;
  });
}

// ─── Sent Mail (with cache) ─────────────────────────────────────────────────

export async function getSentMail(userId: string, userType: string) {
  const cacheKey = getCacheKey(userId, userType, 'sent');
  const cached = sentCache.get(cacheKey);
  if (isCacheValid(cached, INBOX_CACHE_TTL)) {
    return cached.data;
  }

  return singleFlight(cacheKey, async () => {
    const result = await withImap(userId, userType, async (client) => {
      try {
        return await fetchMailboxList(client, '[Gmail]/Sent Mail', { folder: '[Gmail]/Sent Mail' }, true);
      } catch (e) {
        console.error("Failed to fetch sent mail. Folder might be named differently.", e);
        return [];
      }
    });
    sentCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  });
}

// ─── Delete Message ─────────────────────────────────────────────────────────

export async function deleteMessage(userId: string, userType: string, uid: number, folder: string = 'INBOX') {
  await withImap(userId, userType, async (client) => {
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
  });

  // Invalidate caches for this user
  const inboxKey = getCacheKey(userId, userType, 'inbox');
  const sentKey = getCacheKey(userId, userType, 'sent');
  const msgKey = getCacheKey(userId, userType, `msg:${folder}:${uid}`);
  inboxCache.delete(inboxKey);
  sentCache.delete(sentKey);
  messageCache.delete(msgKey);
  unreadCountCache.delete(getCacheKey(userId, userType, 'unread'));
}

// ─── Toggle Flag ────────────────────────────────────────────────────────────

export async function toggleEmailFlag(userId: string, userType: string, uid: number, folder: string, flag: string, value: boolean) {
  await withImap(userId, userType, async (client) => {
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
  });

  // Invalidate inbox/sent cache so flag changes show up
  const inboxKey = getCacheKey(userId, userType, 'inbox');
  const sentKey = getCacheKey(userId, userType, 'sent');
  inboxCache.delete(inboxKey);
  sentCache.delete(sentKey);
  if (flag === '\\Seen') unreadCountCache.delete(getCacheKey(userId, userType, 'unread'));
}

// ─── Background Prefetch (called on login) ──────────────────────────────────
// Fetches inbox list + latest 30 message contents in a SINGLE IMAP connection.
// Does NOT block the UI, runs silently in the background.
// Repeated logins while a prefetch is running share the same run (singleFlight),
// and a fresh inbox cache skips the prefetch entirely.
export async function prefetchEmails(userId: string, userType: string) {
  const PREFETCH_MESSAGE_COUNT = 30;
  const inboxKey = getCacheKey(userId, userType, 'inbox');

  if (isCacheValid(inboxCache.get(inboxKey), INBOX_CACHE_TTL)) {
    return; // recently fetched — nothing to do
  }

  try {
    await singleFlight(getCacheKey(userId, userType, 'prefetch'), async () => {
      let inboxCount = 0;
      let parsedCount = 0;

      await withImap(userId, userType, async (client) => {
        // Step 1: Inbox list (envelope + flags only — fast)
        const inboxResult = await fetchMailboxList(client, 'INBOX');
        inboxCount = inboxResult.length;
        inboxCache.set(inboxKey, { data: inboxResult, timestamp: Date.now() });

        // Step 2: Full content of the latest messages not already cached
        const uidsToFetch = inboxResult.slice(0, PREFETCH_MESSAGE_COUNT).map(m => m.id).filter(uid => {
          const msgCacheKey = getCacheKey(userId, userType, `msg:INBOX:${uid}`);
          return !isCacheValid(messageCache.get(msgCacheKey), MESSAGE_CACHE_TTL);
        });

        if (uidsToFetch.length === 0) return;

        const lock = await client.getMailboxLock('INBOX');
        try {
          const parsePromises: Promise<void>[] = [];
          for await (const msg of client.fetch(uidsToFetch.join(','), { source: true, envelope: true }, { uid: true })) {
            if (!msg || !msg.source) continue;
            parsePromises.push((async () => {
              try {
                const messageData = await parseMessage(msg);
                const msgCacheKey = getCacheKey(userId, userType, `msg:INBOX:${msg.uid}`);
                messageCache.set(msgCacheKey, { data: messageData, timestamp: Date.now() });
                parsedCount++;
              } catch (err) {
                console.error(`[Prefetch] Failed to parse message UID ${msg.uid}:`, err);
              }
            })());
          }
          await Promise.all(parsePromises);
        } catch (err) {
          console.error(`[Prefetch] Bulk fetch failed:`, err);
        } finally {
          lock.release();
        }
      });

      console.log(`[Prefetch] Completed for ${userType}:${userId} — ${inboxCount} inbox items, ${parsedCount} messages cached`);
    });
  } catch (error: any) {
    // Prefetch failure is non-critical — user can still fetch on demand
    if (error?.message === "Email configuration not found.") return;
    console.error(`[Prefetch] Failed for ${userType}:${userId}:`, error?.message || error);
  }
}
