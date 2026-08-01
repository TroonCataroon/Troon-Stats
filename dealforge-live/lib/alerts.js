export function evaluateAlert(alert, listing, now = new Date()) {
  const rule = alert?.rule ?? {};
  if (!listing) return { triggered: false, reason: "Listing unavailable" };

  if (rule.type === "price_below") {
    const price = Number(listing.totalLandedCost ?? listing.costs?.itemPrice);
    const threshold = Number(rule.value);
    const triggered = Number.isFinite(price) && Number.isFinite(threshold) && price <= threshold;
    return {
      triggered,
      reason: triggered ? `Landed cost is $${price.toFixed(2)}, at or below $${threshold.toFixed(2)}.` : "Price threshold not reached.",
    };
  }

  if (rule.type === "ending_within_hours") {
    const endDate = listing.auction?.endDate;
    if (!endDate) return { triggered: false, reason: "No auction end date is available." };
    const hours = (new Date(endDate).getTime() - now.getTime()) / 3_600_000;
    const threshold = Number(rule.value);
    const triggered = Number.isFinite(hours) && hours >= 0 && hours <= threshold;
    return {
      triggered,
      reason: triggered ? `Auction ends in ${Math.max(0, hours).toFixed(1)} hours.` : "Auction is not within the alert window.",
    };
  }

  if (rule.type === "score_above") {
    const score = Number(listing.dealScore);
    const threshold = Number(rule.value);
    const triggered = Number.isFinite(score) && Number.isFinite(threshold) && score >= threshold;
    return { triggered, reason: triggered ? `Deal score is ${score}.` : "Score threshold not reached." };
  }

  return { triggered: false, reason: "Unsupported alert type." };
}

export function evaluateAlerts(alerts, listings, now = new Date()) {
  const listingMap = new Map(listings.map((listing) => [listing.id, listing]));
  return alerts.map((alert) => ({
    ...alert,
    evaluation: evaluateAlert(alert, listingMap.get(alert.listing_id), now),
  }));
}
