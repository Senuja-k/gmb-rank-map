/**
 * Google Business Profile – OAuth2 helper
 *
 * Tokens are stored in Supabase (table: gbp_tokens) keyed by the user's
 * Google email address (account_id = email).
 */

import { google } from "googleapis";
import { supabase } from "./supabase";

function buildOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REDIRECT_URI env vars."
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** Generate the Google consent-screen URL. */
export function getAuthUrl() {
  const oauth2Client = buildOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/business.manage"],
  });
}

/**
 * Exchange a one-time code for tokens, fetch the user's Google email,
 * and persist everything in Supabase.
 * Returns the google email of the connected account.
 */
export async function exchangeCodeAndSave(code) {
  const oauth2Client = buildOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Resolve the authenticated user's email
  const oauth2api = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: userInfo } = await oauth2api.userinfo.get();
  const email = userInfo.email;

  const { error } = await supabase.from("gbp_tokens").upsert({
    account_id: email,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);

  return email;
}

/**
 * Return an oauth2Client pre-loaded with valid tokens for the given Google email.
 * Auto-refreshes and persists a new access-token when close to expiry.
 */
export async function getAuthClientByEmail(email) {
  const { data, error } = await supabase
    .from("gbp_tokens")
    .select("access_token, refresh_token, expiry_date")
    .eq("account_id", email)
    .single();

  if (error || !data) {
    throw new Error(
      `No stored tokens for "${email}". Please reconnect via /gbp/connect.`
    );
  }

  const oauth2Client = buildOAuth2Client();
  oauth2Client.setCredentials({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: data.expiry_date,
  });

  const expiresIn = (data.expiry_date ?? 0) - Date.now();
  if (expiresIn < 5 * 60 * 1000) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);

    await supabase
      .from("gbp_tokens")
      .update({
        access_token: credentials.access_token,
        expiry_date: credentials.expiry_date,
        updated_at: new Date().toISOString(),
      })
      .eq("account_id", email);
  }

  return oauth2Client;
}

/** List all Google accounts that have been OAuth-connected. */
export async function listConnectedAccounts() {
  const { data, error } = await supabase
    .from("gbp_tokens")
    .select("account_id, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Disconnect a Google account by deleting its tokens. */
export async function disconnectAccount(email) {
  const { error } = await supabase
    .from("gbp_tokens")
    .delete()
    .eq("account_id", email);

  if (error) throw new Error(error.message);
}

/** List GBP accounts visible to the connected Google email. */
export async function listGbpAccountsForEmail(email) {
  const auth = await getAuthClientByEmail(email);
  const accountMgmt = google.mybusinessaccountmanagement({ version: "v1", auth });
  const res = await accountMgmt.accounts.list();
  return res.data.accounts ?? [];
}

/**
 * List all locations for a GBP account resource name (e.g. "accounts/123").
 * Returns an array of location objects with name, title, and address.
 */
export async function listGbpLocationsForAccount(email, accountName) {
  const auth = await getAuthClientByEmail(email);
  const bizInfo = google.mybusinessbusinessinformation({ version: "v1", auth });
  const res = await bizInfo.accounts.locations.list({
    parent: accountName,
    readMask: "name,title,storefrontAddress",
  });
  return res.data.locations ?? [];
}

