"use strict";

/**
 * Drives one full Encore lifecycle through the running backend API, matching
 * the demo script in the proposal. Start the backend first (`npm run backend`).
 *
 *   node scripts/demo/endToEnd.js            # "expected" scenario
 *   node scripts/demo/endToEnd.js weak       # weak / strong also available
 */

require("../lib/env");

const BASE = `http://localhost:${process.env.PORT || 4000}/api`;
const scenarioKey = process.argv[2] || "expected";

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}

const step = (n, msg) => console.log(`\n─── ${n}. ${msg} ${"─".repeat(Math.max(0, 50 - msg.length))}`);

async function main() {
  const offering = await call("GET", "/offering");
  const scenario =
    offering.scenarios.find((s) => s.key === scenarioKey) || offering.scenarios[0];
  const ticketsToSell = Math.min(scenario.ticketsSold, 12); // keep the live demo short
  console.log(`\nScenario: ${scenario.label}  (${scenario.ticketsSold} tickets in the pitch; selling ${ticketsToSell} live)`);

  step(1, "Offering terms");
  console.log(offering.terms);

  step(2, "KYC investor1, reject investor2 attempt");
  await call("POST", "/funding/kyc", { role: "admin", investor: "investor1", approved: true });
  console.log("  investor1 KYC ✓");

  step(3, "Funding — all-or-nothing");
  const tokens = Math.ceil(offering.terms.fundingTarget / offering.terms.pricePerToken);
  await call("POST", "/funding/invest", { role: "investor1", tokens });
  await call("POST", "/funding/finalize");
  const funding = await call("GET", "/funding");
  console.log(`  status: ${funding.status}  raised: ${funding.totalRaised}`);

  step(4, "Organizer withdraws the raise");
  await call("POST", "/funding/withdraw", { role: "organizer" });
  await call("POST", "/funding/deliver", { role: "admin", investor: "investor1" });

  step(5, "Ticket sales — split on-chain per ticket");
  await call("POST", "/tickets/sales", { role: "admin", open: true });
  const bought = await call("POST", "/tickets/buy-batch", { role: "fan", count: ticketsToSell });
  const lastSerial = bought[bought.length - 1].serial;
  const health1 = await call("GET", "/health");
  console.log(`  tickets sold: ${health1.tickets.sold}  investor pool: ${health1.revenue.investorPool}`);
  console.log(`  est. payout / token: ${health1.payout.estimatedPerToken}`);

  step(6, "Resale — 10% royalty to the investor pool");
  const nftSerial = bought[bought.length - 1].nft?.nftSerial || lastSerial;
  await call("POST", "/resale", {
    from: "fan",
    to: "investor2",
    nftSerial,
    price: offering.terms.ticketPrice * 1.6,
  });
  const health2 = await call("GET", "/health");
  console.log(`  royalties collected: ${health2.revenue.royaltiesCollected}`);

  step(7, "Compliance — freeze / reject / unfreeze / allow");
  const report = await call("POST", "/compliance/scenario");
  for (const r of report) {
    console.log(`  ${r.allowed ? "ALLOW " : "REJECT"}  ${r.case}  (expected ${r.expected})`);
  }

  step(8, "Settlement");
  await call("POST", "/tickets/sales", { role: "admin", open: false });
  const settle = await call("POST", "/settlement/settle", { role: "admin" });
  console.log(`  settled via ${settle.path}`);
  if (settle.path === "escrow") {
    await call("POST", "/settlement/claim", { role: "investor1" }).catch((e) => console.log("  claim:", e.message));
  }

  const final = await call("GET", "/health");
  console.log("\n══ FINAL ══");
  console.log(`  primary revenue     : ${final.revenue.primaryRevenue}`);
  console.log(`  organizer proceeds  : ${final.revenue.organizerProceeds}`);
  console.log(`  investor pool       : ${final.revenue.investorPool}`);
  console.log(`  royalties collected : ${final.revenue.royaltiesCollected}`);
  console.log("\n(scaled-down live run; the pitch uses the full scenario numbers)\n");
}

main().catch((e) => {
  console.error("\nDEMO FAILED:", e.message);
  process.exit(1);
});
