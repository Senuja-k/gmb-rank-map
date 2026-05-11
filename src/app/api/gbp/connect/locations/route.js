/**
 * GET /api/gbp/connect/locations?email=xxx
 * Fetches all GBP accounts and their locations from Google for the given email.
 * Returns a flat array of location objects.
 */
import { NextResponse } from "next/server";
import { listGbpAccountsForEmail, listGbpLocationsForAccount } from "@/lib/gbp-auth";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "email query param required." }, { status: 400 });
  }

  try {
    const accounts = await listGbpAccountsForEmail(email);

    const locations = (
      await Promise.all(
        accounts.map(async (account) => {
          try {
            const locs = await listGbpLocationsForAccount(email, account.name);
            return locs.map((loc) => ({
              locationName: loc.name,
              accountName: account.name,
              displayName: loc.title ?? loc.name,
              address: formatAddress(loc.storefrontAddress),
            }));
          } catch {
            return [];
          }
        })
      )
    ).flat();

    return NextResponse.json({ locations });
  } catch (err) {
    console.error("[GBP connect/locations]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function formatAddress(addr) {
  if (!addr) return "";
  const parts = [
    ...(addr.addressLines ?? []),
    addr.locality,
    addr.administrativeArea,
  ].filter(Boolean);
  return parts.join(", ");
}
