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
const REJECTED = "REJECTED";

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
  const r = await readClient().readContract({ address: CONTRACT_ADDRESS, functionName: fn, args });
  return r;
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
  route();
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
function setStatus(el, kind, msg, hash) {
  const link = hash ? ` <a href="${txUrl(hash)}" target="_blank" rel="noopener">view tx ↗</a>` : "";
  if (kind === "busy") el.innerHTML = `<span class="spinner"></span><span>${esc(msg)}</span>`;
  else if (kind === "err") el.innerHTML = `<span class="err">✗ ${esc(msg)}</span>`;
  else el.innerHTML = `<span class="good">✓ ${esc(msg)}</span>${link}`;
}

// ------------------------------------------------------------- wallet header
function renderWallet() {
  const el = $("#wallet");
  if (!window.ethereum) { el.innerHTML = `<span class="pill bad">No wallet</span>`; return; }
  if (!wallet.address) { el.innerHTML = `<button class="primary" id="connect">Connect wallet</button>`; $("#connect").onclick = () => connect().catch((e) => alert(e.message)); return; }
  const net = wallet.ok ? `<span class="pill ok">Studionet</span>` : `<button id="switch">Switch to Studionet</button>`;
  el.innerHTML = `${net}<span class="pill" title="${wallet.address}"><a href="${addrUrl(wallet.address)}" target="_blank" rel="noopener">${short(wallet.address)}</a></span>`;
  if ($("#switch")) $("#switch").onclick = () => switchNet().then(route).catch((e) => alert(e.message));
}

async function ensureReady() {
  if (!window.ethereum) throw new Error("Install MetaMask to sign transactions.");
  if (!wallet.address) { await connect(); }
  if (!wallet.ok) { await switchNet(); }
  if (!wallet.ok) throw new Error("Switch your wallet to GenLayer Studionet (chain 61999).");
}

// ---------------------------------------------------------------------- views
function setTab(view) {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
}

async function viewBoard() {
  setTab("board");
  const v = $("#view");
  v.innerHTML = `<div class="banner">Reviews run on GenLayer validators and take ~15–40s to reach consensus. Each card's verdict and rationale come from that consensus, not from this site.</div><div id="list"><div class="empty"><span class="spinner"></span> loading the delivery board…</div></div>`;
  try {
    const orders = await readJSON("list_orders", [0, 50]);
    const list = $("#list");
    if (!orders.length) { list.innerHTML = `<div class="empty">No orders yet. Open the first one.</div>`; return; }
    list.innerHTML = orders.map(cardHTML).join("");
    list.querySelectorAll(".order").forEach((c) => (c.onclick = () => (location.hash = `#/order/${c.dataset.id}`)));
  } catch (e) {
    $("#list").innerHTML = `<div class="empty err">Could not load orders: ${esc(e.message)}</div>`;
  }
}

function cardHTML(o) {
  return `<div class="order" data-id="${o.id}">
    <div class="hd"><span class="title">#${o.id} · ${esc(o.deliverable.slice(0, 80))}${o.deliverable.length > 80 ? "…" : ""}</span>
      <span class="badge ${o.status}">${o.status}</span></div>
    <div class="meta">deposit ${genFmt(o.deposit)} · seller ${short(o.seller)} → buyer ${short(o.buyer)} · due ${whenTs(o.due_at)}${o.verdict !== "NONE" ? ` · AI verdict ${o.verdict} (${o.confidence}%)` : ""}</div>
  </div>`;
}

async function viewOpen() {
  setTab("open");
  const v = $("#view");
  const nowLocal = new Date(Date.now() + 3 * 60 * 1000).toISOString().slice(0, 16);
  v.innerHTML = `<div class="card">
    <h2>Open a delivery order</h2>
    <div class="sub">You deposit GEN behind a public delivery promise. After the due time, validators read the live proof page and rule DELIVERED (you recover the deposit) or FAILED (the buyer receives it).</div>
    <label>Buyer address (receives the deposit on FAILED — must differ from you)</label>
    <input id="buyer" placeholder="0x…" />
    <label>Deliverable — the public promise</label>
    <textarea id="deliverable" rows="2" placeholder="e.g. Release v1.2.0 of acme/widget is published on its GitHub releases page."></textarea>
    <label>Acceptance rule — how a validator should judge it</label>
    <textarea id="rule" rows="2" placeholder="e.g. The releases page must list a tag v1.2.0 with a published date on or before the due date."></textarea>
    <label>Proof URL(s) — 1 to 3 public https links, one per line</label>
    <textarea id="urls" rows="3" placeholder="https://github.com/acme/widget/releases"></textarea>
    <div class="row">
      <div><label>Due at (local time)</label><input id="due" type="datetime-local" value="${nowLocal}" /></div>
      <div><label>Review-by (local time)</label><input id="reviewby" type="datetime-local" /></div>
    </div>
    <div class="hint">Review window must be 5 minutes to 90 days after the due time. For a quick demo, set due ~3 min out and review-by ~15 min out.</div>
    <label>Deposit (GEN)</label>
    <input id="deposit" type="number" step="0.0001" min="0" value="0.001" />
    <div class="inline-actions"><button class="primary" id="submit">Deposit &amp; open order</button></div>
    <div class="status-line" id="st"></div>
  </div>`;
  const dd = new Date(Date.now() + 15 * 60 * 1000);
  $("#reviewby").value = new Date(dd.getTime() - dd.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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
    const deposit = BigInt(Math.round(parseFloat($("#deposit").value) * 1e18));
    if (!/^0x[0-9a-fA-F]{40}$/.test(buyer)) throw new Error("Enter a valid buyer address.");
    if (!deliverable || !rule || !urls.length) throw new Error("Fill in the deliverable, rule and at least one proof URL.");
    if (!(deposit > 0n)) throw new Error("Deposit must be greater than zero.");
    setStatus(st, "busy", "Awaiting signature in your wallet…");
    const hash = await write("open_order", [buyer, deliverable, rule, urls, due, reviewby], deposit);
    setStatus(st, "busy", "Submitted. Waiting for the network to accept it…", hash);
    await waitAccepted(hash);
    const count = Number(await read("get_order_count", []));
    const id = String(count - 1);
    const o = await readJSON("get_order", [id]);
    if (o.status === "OPEN" && o.deliverable === deliverable) {
      setStatus(st, "ok", `Order #${id} opened and funded.`, hash);
      setTimeout(() => (location.hash = `#/order/${id}`), 900);
    } else {
      const reason = await read("get_last_reject", [wallet.address]);
      setStatus(st, "err", `Rejected: ${reason || "invalid terms"}. Your deposit is held as withdrawable credit (see My account).`);
    }
  } catch (e) {
    setStatus(st, "err", e.message || String(e));
  }
}

async function viewOrder(id) {
  const v = $("#view");
  v.innerHTML = `<div class="card"><div class="empty"><span class="spinner"></span> loading order #${esc(id)}…</div></div>`;
  let o;
  try { o = await readJSON("get_order", [id]); }
  catch { v.innerHTML = `<div class="card"><div class="empty err">Order #${esc(id)} not found.</div><button id="back">← board</button></div>`; $("#back").onclick = () => (location.hash = "#/"); return; }
  const now = Math.floor(Date.now() / 1000);
  const due = o.due_at, over = now >= o.review_by;
  const canVerify = o.status === "OPEN" && now >= due && !over;
  const canLapse = o.status === "OPEN" && over;
  v.innerHTML = `<div class="card">
    <div class="hd" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
      <h2 style="margin:0">Order #${esc(o.id)}</h2><span class="badge ${o.status}">${o.status}</span></div>
    <div class="reason" style="border-left-color:var(--accent-2)"><strong>Deliverable.</strong> ${esc(o.deliverable)}</div>
    <div class="kv">
      <div class="k">Acceptance rule</div><div class="v">${esc(o.acceptance_rule)}</div>
      <div class="k">Deposit</div><div class="v">${genFmt(o.deposit)}</div>
      <div class="k">Seller</div><div class="v mono"><a href="${addrUrl(o.seller)}" target="_blank" rel="noopener">${esc(o.seller)}</a></div>
      <div class="k">Buyer (remedy)</div><div class="v mono"><a href="${addrUrl(o.buyer)}" target="_blank" rel="noopener">${esc(o.buyer)}</a></div>
      <div class="k">Due at</div><div class="v">${whenTs(o.due_at)}</div>
      <div class="k">Review by</div><div class="v">${whenTs(o.review_by)}</div>
      <div class="k">Reviews run</div><div class="v">${o.review_count}</div>
      ${o.settlement === "PAID" ? `<div class="k">Settled to</div><div class="v mono">${short(o.recipient)} (${o.recipient.toLowerCase() === o.seller.toLowerCase() ? "seller" : "buyer"})</div>` : ""}
    </div>
    <details class="ev"><summary>Proof evidence (${o.proof_urls.length} URL${o.proof_urls.length > 1 ? "s" : ""})</summary>
      ${o.proof_urls.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)} ↗</a>`).join("")}</details>
    ${o.verdict !== "NONE" ? `<div class="reason"><strong>Validator verdict: <span class="badge ${o.verdict}">${o.verdict}</span> · confidence ${o.confidence}%</strong><br/>${esc(o.reason)}</div>` : `<div class="hint" style="margin-top:14px">No ruling yet.${now < due ? ` Order is due at ${whenTs(due)}.` : ""}</div>`}
    <div class="inline-actions">
      ${canVerify ? `<button class="primary" id="verify">Run validator review</button>` : ""}
      ${canLapse ? `<button id="lapse">Lapse (return deposit to seller)</button>` : ""}
      <button id="back">← board</button>
    </div>
    <div class="status-line" id="st"></div>
  </div>`;
  $("#back").onclick = () => (location.hash = "#/");
  if ($("#verify")) $("#verify").onclick = () => runWrite("verify_delivery", [id], "Validators are rendering the proof page and judging the delivery… (~15–40s)", id);
  if ($("#lapse")) $("#lapse").onclick = () => runWrite("lapse_order", [id], "Lapsing the order…", id);
}

async function runWrite(fn, args, busyMsg, id) {
  const st = $("#st");
  try {
    await ensureReady();
    setStatus(st, "busy", "Awaiting signature in your wallet…");
    const hash = await write(fn, args);
    setStatus(st, "busy", busyMsg, hash);
    await waitAccepted(hash);
    setStatus(st, "ok", "Done. Refreshing…", hash);
    setTimeout(() => viewOrder(id), 1000);
  } catch (e) { setStatus(st, "err", e.message || String(e)); }
}

async function viewAccount() {
  setTab("account");
  const v = $("#view");
  if (!wallet.address) { v.innerHTML = `<div class="card"><div class="empty">Connect your wallet to see credits and withdraw.</div></div>`; return; }
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
    <div class="hint">Credit builds up from returned deposits (DELIVERED / LAPSED), from deposits credited to you as a buyer (FAILED), or from an order whose terms were rejected. Withdraw sends it to your wallet.</div>
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
      setTimeout(viewAccount, 1200);
    } catch (e) { setStatus(st, "err", e.message || String(e)); }
  };
}

// --------------------------------------------------------------------- router
function route() {
  const h = location.hash;
  const m = h.match(/^#\/order\/(\d+)/);
  if (m) return viewOrder(m[1]);
  if (h.startsWith("#/open")) return viewOpen();
  if (h.startsWith("#/account")) return viewAccount();
  return viewBoard();
}

document.querySelectorAll("#tabs button").forEach((b) => {
  b.onclick = () => { location.hash = b.dataset.view === "board" ? "#/" : `#/${b.dataset.view}`; };
});
window.addEventListener("hashchange", route);

$("#contract-foot").innerHTML = CONTRACT_ADDRESS && !CONTRACT_ADDRESS.includes("__")
  ? ` · <a href="${addrUrl(CONTRACT_ADDRESS)}" target="_blank" rel="noopener">contract ${short(CONTRACT_ADDRESS)} ↗</a>` : "";

if (window.ethereum) {
  window.ethereum.on && window.ethereum.on("accountsChanged", () => refreshWallet().then(() => { renderWallet(); route(); }));
  window.ethereum.on && window.ethereum.on("chainChanged", () => refreshWallet().then(() => { renderWallet(); route(); }));
}
await refreshWallet();
renderWallet();
route();
