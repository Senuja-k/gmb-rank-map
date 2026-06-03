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

    // Deduplicate: same location can appear under multiple GBP account groups.
    // Primary key: locationName (Google resource path).
    // Secondary key: displayName+address for cases where the same physical
    // location is listed under different account-group paths.
    const seenNames = new Set();
    const seenDisplay = new Set();
    const unique = locations.filter((loc) => {
      if (seenNames.has(loc.locationName)) return false;
      const displayKey = `${loc.displayName}||${loc.address}`;
      if (seenDisplay.has(displayKey)) return false;
      seenNames.add(loc.locationName);
      seenDisplay.add(displayKey);
      return true;
    });

    return NextResponse.json({ locations: unique });
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
