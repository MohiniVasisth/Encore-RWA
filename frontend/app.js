"use strict";

/* Encore single-page demo UI. Talks to the backend at /api. */

const API = "/api";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = (n) => (n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 }));

let STATUS = null;
let OFFERING = null;
let PREVIEW = false; // true when no backend is reachable (open index.html directly)

/* Static copy of backend/data/event.json — lets the Offering tab render with no
   backend. Keep in sync with that file. */
const PREVIEW_EVENT = {
  name: "Delhi Music Festival",
  description: "One complete Encore lifecycle, hardcoded for the MVP demo.",
  currency: "mUSD",
  disclaimer:
    "Encore is a hackathon prototype on Hedera testnet. Nothing here is an offer of securities or financial advice.",
  offering: { fundingTarget: 30000, tokensForSale: 3000, pricePerToken: 10, revenueSharePct: 18 },
  tickets: { price: 50, maxTickets: 6000, resaleRoyaltyPct: 10 },
  scenarios: {
    weak: { label: "Weak sales", ticketsSold: 2400 },
    expected: { label: "As expected", ticketsSold: 4000 },
    strong: { label: "Strong sales", ticketsSold: 5000 },
  },
};

function buildPreviewOffering() {
  const e = PREVIEW_EVENT;
  const o = e.offering;
  const share = o.revenueSharePct / 100;
  return {
    event: e.name,
    description: e.description,
    currency: e.currency,
    disclaimer: e.disclaimer,
    terms: {
      fundingTarget: o.fundingTarget,
      tokensForSale: o.tokensForSale,
      pricePerToken: o.pricePerToken,
      revenueSharePct: o.revenueSharePct,
      ticketPrice: e.tickets.price,
      maxTickets: e.tickets.maxTickets,
      resaleRoyaltyPct: e.tickets.resaleRoyaltyPct,
      splitPerTicket: {
        pool: +(e.tickets.price * share).toFixed(2),
        organizer: +(e.tickets.price * (1 - share)).toFixed(2),
      },
    },
    scenarios: Object.entries(e.scenarios).map(([key, s]) => {
      const ticketRevenue = s.ticketsSold * e.tickets.price;
      const pool = ticketRevenue * share;
      const perToken = pool / o.tokensForSale;
      return {
        key,
        label: s.label,
        ticketsSold: s.ticketsSold,
        ticketRevenue,
        investorPool: +pool.toFixed(2),
        payoutPerToken: +perToken.toFixed(2),
        returnPct: +(((perToken - o.pricePerToken) / o.pricePerToken) * 100).toFixed(1),
      };
    }),
    onChain: { links: {} },
  };
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
  return json;
}

function role() {
  return $("#role").value;
}

/* Animate an element's number from its current value to `target`. */
function countUp(el, target, fmt = money) {
  const start = Number(String(el.dataset.n ?? 0)) || 0;
  if (start === target) {
    el.textContent = fmt(target);
    return;
  }
  el.dataset.n = target;
  const t0 = performance.now();
  const dur = 550;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(start + (target - start) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function toast(msg, kind = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 4200);
}

async function act(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    refresh();
    return r;
  } catch (e) {
    toast(e.message, "err");
    throw e;
  }
}

/* ---------- tabs ---------- */
$$(".tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    $$(".tab").forEach((s) => (s.hidden = s.id !== `tab-${b.dataset.tab}`));
    refresh();
  })
);

$("#role").addEventListener("change", () => {
  const r = STATUS?.roles?.[role()];
  $("#roleAddr").textContent = r ? `${r.accountId || ""}  ${r.evmAddress || ""}` : "";
});

/* ---------- action buttons ---------- */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const a = btn.dataset.act;
  const H = {
    "kyc-approve": () =>
      act(() => api("POST", "/funding/kyc", { role: "admin", investor: $("#kycInvestor").value, approved: true }), "KYC approved"),
    "kyc-revoke": () =>
      act(() => api("POST", "/funding/kyc", { role: "admin", investor: $("#kycInvestor").value, approved: false }), "KYC revoked"),
    deliver: () =>
      act(() => api("POST", "/funding/deliver", { role: "admin", investor: $("#kycInvestor").value }), "Tokens delivered"),
    invest: () =>
      act(() => api("POST", "/funding/invest", { role: role(), tokens: Number($("#investTokens").value) }), "Investment sent"),
    refund: () => act(() => api("POST", "/funding/refund", { role: role() }), "Refunded"),
    finalize: () => act(() => api("POST", "/funding/finalize", {}), "Raise finalized"),
    withdraw: () => act(() => api("POST", "/funding/withdraw", { role: "organizer" }), "Organizer withdrew"),

    "sales-open": () => act(() => api("POST", "/tickets/sales", { role: "admin", open: true }), "Sales open"),
    "sales-close": () => act(() => api("POST", "/tickets/sales", { role: "admin", open: false }), "Sales closed"),
    buy: () => act(() => api("POST", "/tickets/buy", { role: role() }), "Ticket bought"),
    "buy-batch": () =>
      act(() => api("POST", "/tickets/buy-batch", { role: role(), count: Number($("#buyCount").value) }), "Batch bought"),

    resell: async () => {
      const r = await act(
        () =>
          api("POST", "/resale", {
            from: $("#resaleFrom").value,
            to: $("#resaleTo").value,
            nftSerial: Number($("#resaleSerial").value),
            price: Number($("#resalePrice").value),
          }),
        "Resold"
      );
      $("#resaleResult").innerHTML = `<pre>${JSON.stringify(r, null, 2)}</pre>`;
    },

    freeze: () => act(() => api("POST", "/compliance/freeze", { role: "admin", target: $("#freezeTarget").value, frozen: true }), "Frozen"),
    unfreeze: () => act(() => api("POST", "/compliance/freeze", { role: "admin", target: $("#freezeTarget").value, frozen: false }), "Unfrozen"),
    scenario: async () => {
      const rep = await act(() => api("POST", "/compliance/scenario", {}));
      $("#complianceReport tbody").innerHTML = rep
        .map(
          (r) =>
            `<tr><td>${r.case}</td><td>${r.expected}</td><td class="${
              (r.allowed ? "allowed" : "rejected") === r.expected ? "good" : "bad"
            }">${r.allowed ? "ALLOWED" : "REJECTED — " + (r.reason || "")}</td></tr>`
        )
        .join("");
    },

    sync: () => act(() => api("POST", "/settlement/sync-royalties", { role: "admin" }), "Royalties synced"),
    settle: async () => {
      const r = await act(() => api("POST", "/settlement/settle", { role: "admin" }), "Settled");
      $("#settlementResult").innerHTML = `<pre>${JSON.stringify(r, null, 2)}</pre>`;
    },
    claim: async () => {
      const r = await act(() => api("POST", "/settlement/claim", { role: role() }), "Claimed");
      $("#settlementResult").innerHTML = `<pre>${JSON.stringify(r, null, 2)}</pre>`;
    },
  };
  (H[a] || (() => toast("not wired: " + a, "err")))();
});

/* ---------- renderers ---------- */
function cells(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div></div>`)
    .join("");
}

async function loadStatus() {
  const b = $("#banner");
  try {
    STATUS = await api("GET", "/status");
  } catch (_) {
    PREVIEW = true;
    $("#netPill").textContent = "preview";
    b.hidden = false;
    b.innerHTML =
      "Preview mode — no backend connected. The <b>Offering</b> tab shows real data; other tabs need <code>npm run backend</code> + a testnet deploy.";
    $$("button[data-act]").forEach((btn) => (btn.disabled = true));
    return;
  }
  if (STATUS.network) $("#netPill").textContent = STATUS.network;
  if (!STATUS.ready) {
    b.hidden = false;
    b.textContent = `Backend not fully configured — missing: ${STATUS.missing.join(", ")}. See docs/HEDERA_RESOURCES_NEEDED.md`;
  } else {
    b.hidden = true;
  }
  $("#role").dispatchEvent(new Event("change"));
}

async function loadOffering() {
  OFFERING = PREVIEW ? buildPreviewOffering() : await api("GET", "/offering");
  $("#offeringTerms").innerHTML = cells({
    "Funding target": money(OFFERING.terms.fundingTarget) + " " + OFFERING.currency,
    "Tokens": OFFERING.terms.tokensForSale,
    "Price / token": money(OFFERING.terms.pricePerToken),
    "Revenue share": OFFERING.terms.revenueSharePct + "%",
    "Ticket price": money(OFFERING.terms.ticketPrice),
    "Split / ticket": `${money(OFFERING.terms.splitPerTicket.pool)} pool / ${money(OFFERING.terms.splitPerTicket.organizer)} org`,
  });
  $("#scenarioTable tbody").innerHTML = OFFERING.scenarios
    .map(
      (s) =>
        `<tr><td>${s.label}</td><td>${s.ticketsSold}</td><td>${money(s.ticketRevenue)}</td><td>${money(
          s.investorPool
        )}</td><td>${money(s.payoutPerToken)}</td><td class="${s.returnPct >= 0 ? "good" : "bad"}">${
          s.returnPct >= 0 ? "+" : ""
        }${s.returnPct}%</td></tr>`
    )
    .join("");
  const L = OFFERING.onChain.links;
  $("#onchainLinks").innerHTML = Object.entries(L)
    .filter(([, v]) => v)
    .map(([k, v]) => `<a href="${v}" target="_blank">${k} ↗</a>`)
    .join(" &nbsp; ");
  $("#disclaimer").textContent = OFFERING.disclaimer;
}

async function loadFunding() {
  const f = await api("GET", "/funding");
  $("#fundingSummary").innerHTML = cells({
    Status: f.status,
    Raised: money(f.totalRaised) + " / " + money(f.fundingTarget),
    "Tokens sold": f.tokensSold + " / " + f.tokensForSale,
    Deadline: new Date(f.deadline).toLocaleString(),
    Progress: f.progressPct.toFixed(1) + "%",
  });
  $("#fundingBar").style.width = Math.min(100, f.progressPct) + "%";
}

async function loadTickets() {
  const t = await api("GET", "/tickets");
  const fi = t.financials;
  $("#ticketFinancials").innerHTML = cells({
    "Tickets sold": `${fi.ticketsSold} / ${fi.maxTickets}`,
    "Sales open": fi.salesOpen ? "yes" : "no",
    "Primary revenue": money(fi.primaryRevenue),
    "To organizer": money(fi.organizerProceeds),
    "Investor pool": money(fi.investorPool),
    "Est. payout / token": money(fi.estimatedPayoutPerToken),
  });
  $("#ticketList tbody").innerHTML = Object.entries(t.minted)
    .map(
      ([serial, d]) =>
        `<tr><td>${serial}</td><td>${d.nftSerial || "—"}</td><td>${d.owner || "—"}</td><td>${
          d.boughtAt ? new Date(d.boughtAt).toLocaleTimeString() : "—"
        }</td></tr>`
    )
    .join("");
}

async function loadCompliance() {
  const c = await api("GET", "/compliance");
  $("#complianceStatus").innerHTML = cells(
    Object.fromEntries(
      Object.entries(c).map(([r, s]) => [
        r,
        s.error ? "err" : `${s.kyc ? "KYC" : "no-KYC"} · ${s.frozen ? "FROZEN" : "ok"} · bal ${s.balance}`,
      ])
    )
  );
}

async function loadSettlement() {
  const h = await api("GET", "/health");
  $("#settlementInfo").innerHTML = cells({
    "Investor pool": money(h.revenue.investorPool),
    "Royalties collected": money(h.revenue.royaltiesCollected),
    Settled: h.tickets.settled ? "yes" : "no",
    "Payout / token": money(h.payout.estimatedPerToken),
  });
}

async function loadHealth() {
  const h = await api("GET", "/health");
  const cards = [
    ["Tickets sold", h.tickets.sold, "", (n) => `${Math.round(n)} / ${h.tickets.cap}`],
    ["Primary revenue", h.revenue.primaryRevenue, "", money],
    ["To organizer", h.revenue.organizerProceeds, "", money],
    ["Investor pool", h.revenue.investorPool, "pool", money],
    ["Resale royalties", h.revenue.royaltiesCollected, "pool", money],
    ["Est. payout / token", h.payout.estimatedPerToken, "pool", money],
  ];
  const host = $("#healthCards");
  if (host.children.length !== cards.length) {
    host.innerHTML = cards
      .map(([k, , cls]) => `<div class="card ${cls}"><div class="k">${k}</div><div class="v">0</div></div>`)
      .join("");
  }
  [...host.children].forEach((el, i) => countUp(el.querySelector(".v"), Number(cards[i][1]) || 0, cards[i][3]));
  $("#activity").innerHTML = (h.activity || [])
    .map(
      (a) =>
        `<li><span class="when">${new Date(a.at).toLocaleTimeString()}</span><span class="kind">${
          a.kind
        }</span>${a.message}${a.hashscan ? ` <a href="${a.hashscan}" target="_blank">↗</a>` : ""}</li>`
    )
    .join("");
}

function currentTab() {
  return $$(".tabs button").find((b) => b.classList.contains("active"))?.dataset.tab;
}

async function refresh() {
  const tab = currentTab();
  if (PREVIEW && tab !== "offering") {
    const sec = $(`#tab-${tab}`);
    if (sec && !sec.querySelector(".previewmsg")) {
      const d = document.createElement("div");
      d.className = "previewmsg";
      d.innerHTML =
        "Preview mode — this tab is driven by the backend and on-chain state. Run <code>npm run backend</code> (and deploy to testnet) to use it.";
      sec.prepend(d);
    }
    return;
  }
  const map = {
    offering: loadOffering,
    funding: loadFunding,
    tickets: loadTickets,
    compliance: loadCompliance,
    settlement: loadSettlement,
    health: loadHealth,
  };
  try {
    await (map[tab] || (() => {}))();
  } catch (e) {
    /* surfaced by banner / toast on explicit actions */
  }
}

/* populate role dropdowns for resale */
["#resaleFrom", "#resaleTo"].forEach((sel, i) => {
  $(sel).innerHTML = ["fan", "investor1", "investor2", "organizer", "admin"]
    .map((r) => `<option ${i === 1 && r === "investor2" ? "selected" : ""}>${r}</option>`)
    .join("");
});

(async function init() {
  await loadStatus();
  await loadOffering();
  await refresh();
  setInterval(() => {
    if (["health", "tickets", "funding"].includes(currentTab())) refresh();
  }, 5000);
})();
