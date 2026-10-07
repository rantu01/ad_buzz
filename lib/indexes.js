import clientPromise from "./mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

const INDEX_SPECS = [
  {
    collection: "adAccounts",
    index: { uid: 1, unassignedAt: 1, createdAt: -1 },
    options: {},
  },
  {
    collection: "adAccounts",
    index: { metaAccountId: 1 },
    options: { unique: true, sparse: true },
  },
  {
    collection: "adAccounts",
    index: { accountId: 1 },
    options: { unique: true, sparse: true },
  },
  {
    collection: "adAccounts",
    index: { unassignedAt: 1 },
    options: {},
  },
  {
    collection: "metaAdAccounts",
    index: { metaAccountId: 1 },
    options: {},
  },
  {
    collection: "balanceLogs",
    index: { uid: 1, createdAt: -1 },
    options: {},
  },
  {
    collection: "balanceLogs",
    index: { type: 1, createdAt: 1 },
    options: {},
  },
  {
    // Serves type-filtered lists sorted newest-first (insights, balance-logs).
    collection: "balanceLogs",
    index: { type: 1, createdAt: -1 },
    options: {},
  },
  {
    collection: "deposits",
    index: { uid: 1, createdAt: -1 },
    options: {},
  },
  {
    collection: "deposits",
    index: { status: 1, createdAt: 1 },
    options: {},
  },
  {
    // Serves status-filtered lists sorted newest-first (deposits admin list).
    collection: "deposits",
    index: { status: 1, createdAt: -1 },
    options: {},
  },
  {
    collection: "deposits",
    index: { uid: 1, status: 1 },
    options: {},
  },
  {
    // Serves the ad-accounts topup summary: type-filtered monthly buckets
    // grouped per ad account (Topup This/Last Month + Last Topup Date).
    collection: "balanceLogs",
    index: { type: 1, "metadata.accountId": 1, createdAt: -1 },
    options: {},
  },
  {
    collection: "syncLogs",
    index: { createdAt: -1 },
    options: {},
  },
  {
    collection: "users",
    index: { uid: 1 },
    options: { unique: true },
  },
  {
    // Serves newest-first user lists and paged admin search.
    collection: "users",
    index: { createdAt: -1 },
    options: {},
  },
  {
    collection: "supportTickets",
    index: { status: 1, createdAt: -1 },
    options: {},
  },
  {
    collection: "supportTickets",
    index: { ticketId: 1 },
    options: {},
  },
  {
    collection: "supportTickets",
    index: { uid: 1, createdAt: -1 },
    options: {},
  },
  {
    collection: "paymentMethods",
    index: { createdAt: -1 },
    options: {},
  },
  {
    collection: "syncLocks",
    index: { name: 1 },
    options: { unique: true },
  },
  {
    collection: "webhookEvents",
    index: { expiresAt: 1 },
    options: { expireAfterSeconds: 0 },
  },
  {
    collection: "metaSyncState",
    index: { updatedAt: 1 },
    options: {},
  },
  {
    collection: "metaAdAccounts",
    index: { importedAt: 1 },
    options: {},
  },
];

let initializationPromise = null;

export async function initializeIndexes() {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    // Index builds are independent: issue them concurrently so cold-start
    // cost is the slowest build, not the sum (matters on remote Atlas).
    await Promise.all(
      INDEX_SPECS.map((spec) =>
        db.collection(spec.collection).createIndex(spec.index, spec.options).catch((err) => {
          console.error(`[indexes] Failed to create index on ${spec.collection}:`, err.message);
        })
      )
    );
    return true;
  })();

  return initializationPromise;
}
