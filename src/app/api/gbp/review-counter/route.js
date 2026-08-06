import { NextResponse } from "next/server";
import { fetchReviewsForLocation, getShowroomStats } from "@/lib/gbp";
import { createAdminClient } from "@/lib/supabase-server";

const COLOMBO_OFFSET = "+05:30";
const REVIEW_COUNTER_CONCURRENCY = 3;

function parseDateBoundary(value, boundary) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return null;
  if (boundary === "end") {
    const end = new Date(`${value}T00:00:00${COLOMBO_OFFSET}`);
    end.setUTCDate(end.getUTCDate() + 1);
    return end;
  }
  return new Date(`${value}T00:00:00${COLOMBO_OFFSET}`);
}

function fullLocationName(location) {
  return location.location_name.startsWith("accounts/")
    ? location.location_name
    : `${location.account_name}/${location.location_name}`;
}

function starNumber(starRating) {
  const ratings = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
  };
  return ratings[starRating] ?? null;
}

function sumMetric(rows, metricName) {
  const row = rows.find((metric) => metric.dailyMetric === metricName);
  return (row?.timeSeries?.datedValues ?? []).reduce((sum, point) => sum + Number(point.value ?? 0), 0);
}

function reviewMarker(review) {
  const createTime = review.createTime ?? "";
  if (!createTime) return null;
  return {
    name: review.name ?? "",
    createTime,
  };
}

function sortReviewMarkers(markers) {
  return markers.sort((a, b) => {
    const timeCompare = new Date(a.createTime).getTime() - new Date(b.createTime).getTime();
    if (timeCompare !== 0) return timeCompare;
    return String(a.name).localeCompare(String(b.name));
  });
}
function inputDateParts(value) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function toDateRange(startDate, endDate) {
  const start = inputDateParts(startDate);
  const end = inputDateParts(endDate);
  return {
    startYear: start.year,
    startMonth: start.month,
    startDay: start.day,
    endYear: end.year,
    endMonth: end.month,
    endDay: end.day,
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index], index) };
      } catch (err) {
        results[index] = { status: "rejected", reason: err };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const start = parseDateBoundary(startDate, "start");
    const end = parseDateBoundary(endDate, "end");

    if (!start || !end || start > end) {
      return NextResponse.json({ error: "Valid startDate and endDate are required." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: locations, error } = await supabase
      .from("gbp_locations")
      .select("location_name, account_name, display_name, google_email")
      .eq("is_enabled", true);

    if (error) throw new Error(error.message);
    if (!locations?.length) return NextResponse.json({ counts: {}, fetchErrors: [] });

    const requestedLocations = new Set(searchParams.getAll("location"));
    const selectedLocations = requestedLocations.size
      ? locations.filter((location) => requestedLocations.has(location.location_name))
      : locations;

    const results = await mapWithConcurrency(
      selectedLocations,
      REVIEW_COUNTER_CONCURRENCY,
      async (location) => {
        const locationName = fullLocationName(location);
        const metricErrors = [];
        let reviews = [];
        try {
          reviews = await fetchReviewsForLocation(location.google_email, locationName, {
            onlyUnreplied: false,
          });
        } catch (err) {
          metricErrors.push(`reviews: ${err.message}`);
        }

        const collected = reviews.filter((review) => {
          const createdAt = new Date(review.createTime ?? 0);
          return createdAt >= start && createdAt < end;
        }).length;
        const reviewMarkers = sortReviewMarkers(
          reviews
            .map(reviewMarker)
            .filter(Boolean)
            .filter((marker) => new Date(marker.createTime) < end)
        );
        const ratingValues = reviews.map((review) => starNumber(review.starRating)).filter(Number.isFinite);
        const rating = ratingValues.length
          ? Number((ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length).toFixed(1))
          : null;
        let performance = [];
        let performanceLoaded = false;
        const dateRange = toDateRange(startDate, endDate);
        try {
          performance = await getShowroomStats(location.google_email, locationName, dateRange);
          performanceLoaded = true;
        } catch (err) {
          metricErrors.push(`performance: ${err.message}`);
        }

        const googleSearchMobile = performanceLoaded ? sumMetric(performance, "BUSINESS_IMPRESSIONS_MOBILE_SEARCH") : null;
        const googleSearchDesktop = performanceLoaded ? sumMetric(performance, "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH") : null;
        const googleMapsMobile = performanceLoaded ? sumMetric(performance, "BUSINESS_IMPRESSIONS_MOBILE_MAPS") : null;
        const googleMapsDesktop = performanceLoaded ? sumMetric(performance, "BUSINESS_IMPRESSIONS_DESKTOP_MAPS") : null;
        const calls = performanceLoaded ? sumMetric(performance, "CALL_CLICKS") : null;
        const directions = performanceLoaded ? sumMetric(performance, "BUSINESS_DIRECTION_REQUESTS") : null;
        const websiteClicks = performanceLoaded ? sumMetric(performance, "WEBSITE_CLICKS") : null;
        const chatClicks = null;

        return [location.location_name, {
          collected,
          totalReviews: reviews.length,
          reviewMarkers,
          rating,
          googleSearchMobile,
          googleSearchDesktop,
          googleMapsMobile,
          googleMapsDesktop,
          calls,
          chatClicks,
          directions,
          websiteClicks,
          errors: metricErrors,
        }];
      }
    );

    const counts = {};
    const fetchErrors = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const [locationName, metrics] = result.value;
        counts[locationName] = metrics;
        if (metrics.errors?.length) {
          const location = selectedLocations[index];
          fetchErrors.push(`${location.display_name}: ${metrics.errors.join("; ")}`);
        }
      } else {
        const location = selectedLocations[index];
        fetchErrors.push(`${location.display_name}: ${result.reason?.message ?? result.reason}`);
      }
    });

    return NextResponse.json({ counts, fetchErrors });
  } catch (err) {
    console.error("[GBP review counter]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

