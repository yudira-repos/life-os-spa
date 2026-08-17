import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  type AccountBase,
  type Transaction as PlaidTransaction,
  type RemovedTransaction,
} from "plaid";

// The Plaid client. This is the ONLY file that imports the Plaid SDK — every
// other file in the module talks to Plaid through the functions below, so
// swapping providers (or adding a second one) is a change to one file.
//
// Configuration is required: no keys, no linking. The module degrades to
// manual account entry rather than pretending, and the setup error says
// exactly which variables are missing.

export class PlaidNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(
      `Plaid is not configured — missing ${missing.join(", ")}. ` +
        "Create a Plaid account at https://dashboard.plaid.com, then set " +
        "PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (sandbox | production)."
    );
    this.name = "PlaidNotConfiguredError";
  }
}

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

function requireConfig() {
  const missing: string[] = [];
  if (!process.env.PLAID_CLIENT_ID) missing.push("PLAID_CLIENT_ID");
  if (!process.env.PLAID_SECRET) missing.push("PLAID_SECRET");
  if (missing.length > 0) throw new PlaidNotConfiguredError(missing);

  const env = (process.env.PLAID_ENV ?? "sandbox").toLowerCase();
  const basePath = PlaidEnvironments[env];
  if (!basePath) {
    throw new Error(
      `PLAID_ENV="${env}" is not a Plaid environment. Use "sandbox" or "production".`
    );
  }
  return { basePath };
}

let cachedClient: PlaidApi | null = null;

export function plaidClient(): PlaidApi {
  if (cachedClient) return cachedClient;
  const { basePath } = requireConfig();

  cachedClient = new PlaidApi(
    new Configuration({
      basePath,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
          "PLAID-SECRET": process.env.PLAID_SECRET,
          "Plaid-Version": "2020-09-14",
        },
      },
    })
  );
  return cachedClient;
}

// --- Link -------------------------------------------------------------------

/**
 * A Link token is short-lived and single-purpose. `clientUserId` must be a
 * stable, non-PII id — we pass the internal User id, never an email address,
 * because Plaid recommends against sending PII here and we'd rather not
 * hand a third party an email we don't have to.
 */
export async function createLinkToken(params: {
  clientUserId: string;
  householdName: string;
  /** Set to re-authenticate an existing Item after LOGIN_REQUIRED. */
  accessToken?: string;
}): Promise<string> {
  const client = plaidClient();

  const response = await client.linkTokenCreate({
    user: { client_user_id: params.clientUserId },
    client_name: `LifeOS — ${params.householdName}`.slice(0, 30),
    language: "en",
    country_codes: [CountryCode.Us],
    // In update mode Plaid rejects `products`; the Item keeps what it had.
    ...(params.accessToken
      ? { access_token: params.accessToken }
      : { products: [Products.Transactions] }),
    webhook: webhookUrl(),
    transactions: { days_requested: 730 },
  });

  return response.data.link_token;
}

function webhookUrl(): string | undefined {
  const base = process.env.PLAID_WEBHOOK_URL ?? process.env.NEXTAUTH_URL;
  if (!base) return undefined;
  // Plaid can't reach localhost — sending it anyway just produces noisy
  // delivery failures in the dashboard.
  if (/localhost|127\.0\.0\.1/.test(base)) return undefined;
  return `${base.replace(/\/$/, "")}/api/financial/plaid/webhook`;
}

export interface ExchangeResult {
  accessToken: string;
  itemId: string;
}

export async function exchangePublicToken(publicToken: string): Promise<ExchangeResult> {
  const client = plaidClient();
  const response = await client.itemPublicTokenExchange({ public_token: publicToken });
  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
  };
}

// --- Item / institution -----------------------------------------------------

export async function getItemInstitution(accessToken: string): Promise<{
  institutionId: string | null;
  institutionName: string | null;
  consentExpiresAt: Date | null;
}> {
  const client = plaidClient();
  const item = await client.itemGet({ access_token: accessToken });
  const institutionId = item.data.item.institution_id ?? null;
  const consentExpiration = item.data.item.consent_expiration_time;

  let institutionName: string | null = null;
  if (institutionId) {
    try {
      const inst = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      institutionName = inst.data.institution.name;
    } catch {
      // A missing display name is cosmetic — never fail a link over it.
      institutionName = null;
    }
  }

  return {
    institutionId,
    institutionName,
    consentExpiresAt: consentExpiration ? new Date(consentExpiration) : null,
  };
}

export async function removeItem(accessToken: string): Promise<void> {
  const client = plaidClient();
  await client.itemRemove({ access_token: accessToken });
}

// --- Accounts ---------------------------------------------------------------

export async function fetchAccounts(accessToken: string): Promise<AccountBase[]> {
  const client = plaidClient();
  const response = await client.accountsBalanceGet({ access_token: accessToken });
  return response.data.accounts;
}

// --- Transactions -----------------------------------------------------------

export interface SyncPage {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: RemovedTransaction[];
  cursor: string;
  accounts: AccountBase[];
}

/**
 * Drain /transactions/sync from `cursor` to the present.
 *
 * `/transactions/sync` is the right endpoint (not /transactions/get): it's
 * cursor-based, so it tells us exactly what changed since last time —
 * including transactions that were *removed* after posting, which a date-range
 * fetch would silently leave behind as phantom spending.
 *
 * The loop is bounded. A pathological account with an enormous backlog gets
 * partially synced and picked up on the next run rather than hanging a request.
 */
export async function syncTransactions(
  accessToken: string,
  cursor: string | null,
  maxPages = 20
): Promise<SyncPage> {
  const client = plaidClient();

  const added: PlaidTransaction[] = [];
  const modified: PlaidTransaction[] = [];
  const removed: RemovedTransaction[] = [];
  let nextCursor = cursor ?? undefined;
  let accounts: AccountBase[] = [];
  let pages = 0;
  let hasMore = true;

  while (hasMore && pages < maxPages) {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor: nextCursor,
      count: 500,
    });

    const data = response.data;
    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed);
    accounts = data.accounts ?? accounts;
    nextCursor = data.next_cursor;
    hasMore = data.has_more;
    pages += 1;
  }

  return { added, modified, removed, cursor: nextCursor ?? "", accounts };
}

/**
 * Map a Plaid API error to a PlaidItem.status we store. LOGIN_REQUIRED is the
 * one that matters operationally: the user must re-authenticate through Link
 * in update mode, and until they do, every sync will fail the same way.
 */
export function itemStatusFromError(error: unknown): {
  status: string;
  detail: string;
} {
  const plaidError = extractPlaidError(error);
  if (!plaidError) {
    return {
      status: "ERROR",
      detail: error instanceof Error ? error.message : "Unknown sync error",
    };
  }

  switch (plaidError.error_code) {
    case "ITEM_LOGIN_REQUIRED":
    case "PENDING_EXPIRATION":
      return { status: "LOGIN_REQUIRED", detail: plaidError.error_message };
    case "ITEM_NOT_FOUND":
    case "ITEM_NOT_SUPPORTED":
      return { status: "REVOKED", detail: plaidError.error_message };
    default:
      return { status: "ERROR", detail: plaidError.error_message };
  }
}

interface PlaidErrorBody {
  error_code: string;
  error_message: string;
  error_type: string;
}

export function extractPlaidError(error: unknown): PlaidErrorBody | null {
  const response = (error as { response?: { data?: unknown } })?.response?.data;
  if (
    response &&
    typeof response === "object" &&
    "error_code" in response &&
    "error_message" in response
  ) {
    return response as PlaidErrorBody;
  }
  return null;
}

export type { AccountBase, PlaidTransaction, RemovedTransaction };
