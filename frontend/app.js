import { CONTRACT_ADDRESS, NETWORK, GLJS } from "./config.js";

const { createClient } = await import(GLJS);
const { TransactionStatus } = await import(GLJS + "/types");

const CHAIN = {
  id: NETWORK.id,
  name: NETWORK.name,
  nativeCurrency: NETWORK.nativeCurrency,
  rpcUrls: { default: { http: [NETWORK.rpcUrl] } },
  defaultNumberOfInitialValidators: 5,
  defaultConsensusMaxRotations: 3,
};
const ZERO = "0x0000000000000000000000000000000000000000";

let wallet = { address: "", chainId: "", ok: false };

// ------------------------------------------------------------------ chain io
function readClient() {
  return createClient({ chain: CHAIN, endpoint: NETWORK.rpcUrl, account: { address: ZERO } });
}
async function writeClient() {
  const c = createClient({ chain: CHAIN, account: wallet.address });
  if (c.initializeConsensusSmartContract) await c.initializeConsensusSmartContract();
  return c;
}
async function read(fn, args = []) {
  return readClient().readContract({ address: CONTRACT_ADDRESS, functionName: fn, args });
}
async function readJSON(fn, args = []) {
  const r = await read(fn, args);
  return typeof r === "string" ? JSON.parse(r) : r;
}
async function write(fn, args, value = 0n) {
  const c = await writeClient();
  return c.writeContract({ address: CONTRACT_ADDRESS, functionName: fn, args, value });
}
async function waitAccepted(hash) {
  return readClient().waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, retries: 200, interval: 4000 });
}

// -------------------------------------------------------------------- wallet
function provider() {
  if (!window.ethereum) throw new Error("No injected wallet found. Install MetaMask.");
  return window.ethereum;
}
async function refreshWallet() {
  if (!window.ethereum) { wallet = { address: "", chainId: "", ok: false }; return; }
  const p = provider();
  const accs = await p.request({ method: "eth_accounts" });
  const chainId = String(await p.request({ method: "eth_chainId" }));
  wallet = { address: accs[0] || "", chainId, ok: chainId.toLowerCase() === NETWORK.hexId };
}
async function connect() {
  const p = provider();
  const accs = await p.request({ method: "eth_requestAccounts" });
  wallet.address = accs[0] || "";
  await switchNet();
  await refreshWallet();
  renderWallet();
}
async function switchNet() {
  const p = provider();
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: NETWORK.hexId }] });
  } catch (e) {
    if (e && e.code === 4902) {
      await p.request({ method: "wallet_addEthereumChain", params: [{
        chainId: NETWORK.hexId, chainName: NETWORK.name, nativeCurrency: NETWORK.nativeCurrency,
        rpcUrls: [NETWORK.rpcUrl], blockExplorerUrls: [NETWORK.explorerUrl] }] });
    } else { throw e; }
  }
  await refreshWallet();
  renderWallet();
}

// --------------------------------------------------------------------- utils
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const short = (a) => (a && a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a || "—");
const genFmt = (wei) => { try { return (Number(BigInt(wei)) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6 }) + " GEN"; } catch { return wei + " wei"; } };
const txUrl = (h) => `${NETWORK.explorerUrl}/tx/${h}`;
const addrUrl = (a) => `${NETWORK.explorerUrl}/address/${a}`;
const whenTs = (t) => (t ? new Date(t * 1000).toLocaleString() : "—");
const qid = () => new URLSearchParams(location.search).get("id");
const TERMINAL = ["DELIVERED", "FAILED", "LAPSED"];
function setStatus(el, kind, msg, hash) {
  const link = hash ? ` <a href="${txUrl(hash)}" target="_blank" rel="noopener">view tx ↗</a>` : "";
  if (kind === "busy") el.innerHTML = `<span class="spinner"></span><span>${esc(msg)}</span>`;
  else if (kind === "err") el.innerHTML = `<span class="err">✗ ${esc(msg)}</span>`;
  else el.innerHTML = `<span class="good">✓ ${esc(msg)}</span>${link}`;
}

// -------------------------------------------------------------------- chrome
const NAV = [
  { href: "/", label: "Board", page: "board" },
  { href: "/open", label: "Open an order", page: "open" },
  { href: "/explorer", label: "Explorer", page: "explorer" },
  { href: "/account", label: "My account", page: "account" },
];
function renderNav(current) {
  const el = $("#nav");
  if (el) el.innerHTML = NAV.map((n) => `<a class="tab ${n.page === current ? "active" : ""}" href="${n.href}">${esc(n.label)}</a>`).join("");
}
function renderWallet() {
  const el = $("#wallet");
  if (!el) return;
  if (!window.ethereum) { el.innerHTML = `<span class="pill bad">No wallet</span>`; return; }
  if (!wallet.address) { el.innerHTML = `<button class="primary" id="connect">Connect wallet</button>`; $("#connect").onclick = () => connect().catch((e) => alert(e.message)); return; }
  const net = wallet.ok ? `<span class="pill ok">Studionet</span>` : `<button id="switch">Switch to Studionet</button>`;
  el.innerHTML = `${net}<span class="pill" title="${wallet.address}"><a href="${addrUrl(wallet.address)}" target="_blank" rel="noopener">${short(wallet.address)}</a></span>`;
  if ($("#switch")) $("#switch").onclick = () => switchNet().catch((e) => alert(e.message));
}
function footContract() {
  const el = $("#contract-foot");
  if (el) el.innerHTML = CONTRACT_ADDRESS && !CONTRACT_ADDRESS.includes("__")
    ? ` · <a href="${addrUrl(CONTRACT_ADDRESS)}" target="_blank" rel="noopener">contract ${short(CONTRACT_ADDRESS)} ↗</a>` : "";
}
async function ensureReady() {
  if (!window.ethereum) throw new Error("Install MetaMask to sign transactions.");
  if (!wallet.address) { await connect(); }
  if (!wallet.ok) { await switchNet(); }
  if (!wallet.ok) throw new Error("Switch your wallet to GenLayer Studionet (chain 61999).");
}

// ------------------------------------------------------------- card + verdict
function badge(text) { return `<span class="badge ${text}">${text}</span>`; }
function cardHTML(o, hrefBase) {
  return `<a class="order" href="${hrefBase}?id=${o.id}">
    <div class="hd"><span class="title">#${o.id} · ${esc(o.deliverable.slice(0, 80))}${o.deliverable.length > 80 ? "…" : ""}</span>${badge(o.status)}</div>
    <div class="meta">deposit ${genFmt(o.deposit)} · seller ${short(o.seller)} → buyer ${short(o.buyer)} · due ${whenTs(o.due_at)}${o.verdict !== "NONE" ? ` · AI verdict ${o.verdict} (${o.confidence}%)` : ""}</div>
  </a>`;
}

// --------------------------------------------------------------------- pages
async function pageBoard() {
  const v = $("#view");
  v.innerHTML = `<div class="banner">Reviews run on GenLayer validators and take ~15–40s to reach consensus. Verdicts and rationale come from that consensus, not from this site. Looking for resolved cases and payouts? See the <a href="/explorer">Explorer</a>.</div><div id="list"><div class="empty"><span class="spinner"></span> loading the delivery board…</div></div>`;
  try {
    const orders = await readJSON("list_orders", [0, 50]);
    const open = orders.filter((o) => o.status === "OPEN");
    const list = $("#list");
    if (!orders.length) { list.innerHTML = `<div class="empty">No orders yet. <a href="/open">Open the first one.</a></div>`; return; }
    list.innerHTML =
      `<h3 class="sect">Open orders (${open.length})</h3>` +
      (open.length ? open.map((o) => cardHTML(o, "/order")).join("") : `<div class="empty">None open right now — see the <a href="/explorer">Explorer</a> for resolved cases.</div>`) +
      `<h3 class="sect">Most recent</h3>` +
      orders.slice(0, 6).map((o) => cardHTML(o, "/order")).join("");
  } catch (e) {
    $("#list").innerHTML = `<div class="empty err">Could not load orders: ${esc(e.message)}</div>`;
  }
}

async function pageExplorer() {
  const v = $("#view");
  v.innerHTML = `<div class="card"><h2>Explorer — resolved cases</h2><div class="sub">Terminal outcomes decided by GenLayer validator consensus, with the rationale and the on-chain payout. Public and read-only — no wallet needed.</div><div id="stats"></div></div><div id="list"><div class="empty"><span class="spinner"></span> loading resolved cases…</div></div>`;
  try {
    const orders = await readJSON("list_orders", [0, 50]);
    const resolved = orders.filter((o) => TERMINAL.includes(o.status));
    const n = (s) => resolved.filter((o) => o.status === s).length;
    $("#stats").innerHTML = `<div class="kv">
      <div class="k">Total orders</div><div class="v">${orders.length}</div>
      <div class="k">Resolved</div><div class="v">${resolved.length} — ${n("DELIVERED")} delivered · ${n("FAILED")} failed · ${n("LAPSED")} lapsed</div>
    </div>`;
    const list = $("#list");
    if (!resolved.length) { list.innerHTML = `<div class="empty">No resolved cases yet.</div>`; return; }
    list.innerHTML = resolved.map(resolvedRow).join("");
  } catch (e) {
    $("#list").innerHTML = `<div class="empty err">Could not load resolved cases: ${esc(e.message)}</div>`;
  }
}
function resolvedRow(o) {
  const who = o.recipient && o.recipient.toLowerCase() === o.seller.toLowerCase() ? "seller" : "buyer";
  return `<div class="order" style="cursor:default">
    <div class="hd"><a class="title" href="/order?id=${o.id}">#${o.id} · ${esc(o.deliverable.slice(0, 70))}${o.deliverable.length > 70 ? "…" : ""}</a>
      <span>${badge(o.status)} ${o.verdict !== "NONE" ? `<span class="pill">${o.confidence}%</span>` : ""}</span></div>
    ${o.reason ? `<div class="reason" style="margin:10px 0">${esc(o.reason)}</div>` : ""}
    <div class="meta">payout ${genFmt(o.deposit)} → ${who} ${short(o.recipient)} · resolved ${whenTs(o.resolved_at)} · reviews ${o.review_count} · <a href="/order?id=${o.id}">details →</a></div>
  </div>`;
}

function pageOpen() {
  const v = $("#view");
  const now3 = new Date(Date.now() + 3 * 60 * 1000);
  const now15 = new Date(Date.now() + 15 * 60 * 1000);
  const loc = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  v.innerHTML = `<div class="card">
    <h2>Open a delivery order</h2>
    <div class="sub">Deposit GEN behind a public delivery promise. After the due time, validators read the live proof page and rule DELIVERED (you recover the deposit) or FAILED (the buyer receives it).</div>
    <label>Buyer address (receives the deposit on FAILED — must differ from you)</label>
    <input id="buyer" placeholder="0x…" />
    <label>Deliverable — the public promise</label>
    <textarea id="deliverable" rows="2" placeholder="e.g. Release v1.2.0 of acme/widget is published on its GitHub releases page."></textarea>
    <label>Acceptance rule — how a validator should judge it</label>
    <textarea id="rule" rows="2" placeholder="e.g. The releases page must list a tag v1.2.0 published on or before the due date."></textarea>
    <label>Proof URL(s) — 1 to 3 public https links, one per line</label>
    <textarea id="urls" rows="3" placeholder="https://github.com/acme/widget/releases"></textarea>
    <div class="row">
      <div><label>Due at (local time)</label><input id="due" type="datetime-local" value="${loc(now3)}" /></div>
      <div><label>Review-by (local time)</label><input id="reviewby" type="datetime-local" value="${loc(now15)}" /></div>
    </div>
    <div class="hint">Review window must be 5 minutes to 90 days after the due time. For a quick demo keep the defaults (due ~3 min, review-by ~15 min).</div>
    <label>Deposit (GEN)</label>
    <input id="deposit" type="number" step="0.0001" min="0" value="0.001" />
    <div class="inline-actions"><button class="primary" id="submit">Deposit &amp; open order</button></div>
    <div class="status-line" id="st"></div>
  </div>`;
  $("#submit").onclick = submitOrder;
}
async function submitOrder() {
  const st = $("#st");
  try {
    await ensureReady();
    const buyer = $("#buyer").value.trim();
    const deliverable = $("#deliverable").value.trim();
    const rule = $("#rule").value.trim();
    const urls = $("#urls").value.split("\n").map((s) => s.trim()).filter(Boolean);
    const due = Math.floor(new Date($("#due").value).getTime() / 1000);
    const reviewby = Math.floor(new Date($("#reviewby").value).getTime() / 1000);
    const depositStr = $("#deposit").value;
    if (!/^0x[0-9a-fA-F]{40}$/.test(buyer)) throw new Error("Enter a valid buyer address.");
    if (!deliverable || !rule || !urls.length) throw new Error("Fill in the deliverable, rule and at least one proof URL.");
    if (!Number.isFinite(due) || !Number.isFinite(reviewby)) throw new Error("Pick a due time and a review-by time.");
    const deposit = BigInt(Math.round(parseFloat(depositStr) * 1e18));
    if (!(deposit > 0n)) throw new Error("Deposit must be greater than zero.");
    setStatus(st, "busy", "Awaiting signature in your wallet…");
    const hash = await write("open_order", [buyer, deliverable, rule, urls, due, reviewby], deposit);
    setStatus(st, "busy", "Submitted. Waiting for the network to accept it…", hash);
    await waitAccepted(hash);
    const count = Number(await read("get_order_count", []));
    const id = String(count - 1);
    const o = await readJSON("get_order", [id]);
    if (o.status === "OPEN" && o.deliverable === deliverable) {
      setStatus(st, "ok", `Order #${id} opened and funded. Redirecting…`, hash);
      setTimeout(() => (location.href = `/order?id=${id}`), 1000);
    } else {
      const reason = await read("get_last_reject", [wallet.address]);
      setStatus(st, "err", `Rejected: ${reason || "invalid terms"}. Your deposit is held as withdrawable credit (see My account).`);
    }
  } catch (e) {
    setStatus(st, "err", e.message || String(e));
  }
}

async function pageOrder() {
  const id = qid();
  const v = $("#view");
  if (!id || !/^\d+$/.test(id)) { v.innerHTML = `<div class="card"><div class="empty">No order id. <a href="/">← board</a></div></div>`; return; }
  v.innerHTML = `<div class="card"><div class="empty"><span class="spinner"></span> loading order #${esc(id)}…</div></div>`;
  const notFound = () => { v.innerHTML = `<div class="card"><div class="empty err">Order #${esc(id)} not found.</div><div class="inline-actions"><a class="tab" href="/">← board</a></div></div>`; };
  let o;
  try {
    const count = Number(await read("get_order_count", []));
    if (!Number.isFinite(count) || Number(id) >= count) { notFound(); return; }
    o = await readJSON("get_order", [id]);
  } catch { notFound(); return; }
  const now = Math.floor(Date.now() / 1000);
  const due = o.due_at, over = now >= o.review_by;
  const canVerify = o.status === "OPEN" && now >= due && !over;
  const canLapse = o.status === "OPEN" && over;
  v.innerHTML = `<div class="card">
    <div class="hd" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
      <h2 style="margin:0">Order #${esc(o.id)}</h2>${badge(o.status)}</div>
    <div class="reason" style="border-left-color:var(--accent-2)"><strong>Deliverable.</strong> ${esc(o.deliverable)}</div>
    <div class="kv">
      <div class="k">Acceptance rule</div><div class="v">${esc(o.acceptance_rule)}</div>
      <div class="k">Deposit</div><div class="v">${genFmt(o.deposit)}</div>
      <div class="k">Seller</div><div class="v mono"><a href="${addrUrl(o.seller)}" target="_blank" rel="noopener">${esc(o.seller)}</a></div>
      <div class="k">Buyer (remedy)</div><div class="v mono"><a href="${addrUrl(o.buyer)}" target="_blank" rel="noopener">${esc(o.buyer)}</a></div>
      <div class="k">Due at</div><div class="v">${whenTs(o.due_at)}</div>
      <div class="k">Review by</div><div class="v">${whenTs(o.review_by)}</div>
      <div class="k">Reviews run</div><div class="v">${o.review_count}</div>
      ${o.settlement === "PAID" ? `<div class="k">Settled payout</div><div class="v">${genFmt(o.deposit)} → ${short(o.recipient)} (${o.recipient.toLowerCase() === o.seller.toLowerCase() ? "seller" : "buyer"})</div>` : ""}
    </div>
    <details class="ev"><summary>Proof evidence (${o.proof_urls.length} URL${o.proof_urls.length > 1 ? "s" : ""})</summary>
      ${o.proof_urls.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)} ↗</a>`).join("")}</details>
    ${o.verdict !== "NONE" ? `<div class="reason"><strong>Validator verdict: ${badge(o.verdict)} · confidence ${o.confidence}%</strong><br/>${esc(o.reason)}</div>` : `<div class="hint" style="margin-top:14px">No ruling yet.${now < due ? ` Order is due at ${whenTs(due)}.` : ""}</div>`}
    <div class="inline-actions">
      ${canVerify ? `<button class="primary" id="verify">Run validator review</button>` : ""}
      ${canLapse ? `<button id="lapse">Lapse (return deposit to seller)</button>` : ""}
      <a class="tab" href="/">← board</a><a class="tab" href="/explorer">Explorer</a>
    </div>
    <div class="status-line" id="st"></div>
  </div>`;
  if ($("#verify")) $("#verify").onclick = () => runWrite("verify_delivery", [id], "Validators are rendering the proof page and judging the delivery… (~15–40s)", pageOrder);
  if ($("#lapse")) $("#lapse").onclick = () => runWrite("lapse_order", [id], "Lapsing the order…", pageOrder);
}
async function runWrite(fn, args, busyMsg, refresh) {
  const st = $("#st");
  try {
    await ensureReady();
    setStatus(st, "busy", "Awaiting signature in your wallet…");
    const hash = await write(fn, args);
    setStatus(st, "busy", busyMsg, hash);
    await waitAccepted(hash);
    setStatus(st, "ok", "Done. Refreshing…", hash);
    setTimeout(refresh, 1000);
  } catch (e) { setStatus(st, "err", e.message || String(e)); }
}

async function pageAccount() {
  const v = $("#view");
  if (!window.ethereum) { v.innerHTML = `<div class="card"><div class="empty">No wallet found. Install MetaMask to see credits and withdraw.</div></div>`; return; }
  if (!wallet.address) {
    v.innerHTML = `<div class="card"><div class="empty">Connect your wallet to see credits and withdraw.</div><div class="inline-actions"><button class="primary" id="c">Connect wallet</button></div></div>`;
    $("#c").onclick = () => connect().then(pageAccount).catch((e) => alert(e.message)); return;
  }
  v.innerHTML = `<div class="card"><div class="empty"><span class="spinner"></span> loading your account…</div></div>`;
  const credit = await read("get_credit", [wallet.address]);
  const reject = await read("get_last_reject", [wallet.address]);
  v.innerHTML = `<div class="card">
    <h2>My account</h2>
    <div class="sub">${esc(short(wallet.address))}</div>
    <div class="kv">
      <div class="k">Withdrawable credit</div><div class="v">${genFmt(credit)}</div>
      ${reject ? `<div class="k">Last rejected order</div><div class="v err">${esc(reject)}</div>` : ""}
    </div>
    <div class="hint">Credit builds up from returned deposits (DELIVERED / LAPSED), deposits credited to you as a buyer (FAILED), or an order whose terms were rejected. Withdraw sends it to your wallet.</div>
    <div class="inline-actions">${BigInt(credit) > 0n ? `<button class="primary" id="wd">Withdraw ${genFmt(credit)}</button>` : `<button disabled>Nothing to withdraw</button>`}</div>
    <div class="status-line" id="st"></div>
  </div>`;
  if ($("#wd")) $("#wd").onclick = async () => {
    const st = $("#st");
    try {
      await ensureReady();
      setStatus(st, "busy", "Awaiting signature…");
      const hash = await write("withdraw", [credit.toString()]);
      setStatus(st, "busy", "Withdrawing…", hash);
      await waitAccepted(hash);
      setStatus(st, "ok", "Withdrawn.", hash);
      setTimeout(pageAccount, 1200);
    } catch (e) { setStatus(st, "err", e.message || String(e)); }
  };
}

// --------------------------------------------------------------------- boot
const PAGES = { board: pageBoard, open: pageOpen, explorer: pageExplorer, account: pageAccount, order: pageOrder };
const page = document.body.dataset.page || "board";
renderNav(page === "order" ? "" : page);
footContract();
if (window.ethereum) {
  window.ethereum.on && window.ethereum.on("accountsChanged", () => refreshWallet().then(() => { renderWallet(); if (page === "account") pageAccount(); }));
  window.ethereum.on && window.ethereum.on("chainChanged", () => refreshWallet().then(renderWallet));
}
await refreshWallet();
renderWallet();
(PAGES[page] || pageBoard)();
