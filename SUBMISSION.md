# GENLAYER PROJECT EXPLORER — SUBMISSION DRAFT
**Project:** DropProof · **Prepared:** 2026-10-14 · **Status: READY**

No blockers. Contract is live on Studionet, every write method has a UI caller,
and the board already shows one DELIVERED + one FAILED order plus completed
withdrawals, visible without a wallet.

---

## Project name
DropProof

## Primary category
**Marketplaces** — the contract runs a fulfilment-escrow mechanism (deposit, a
public deliverable, completion review, conditional release). Not `Dispute
Resolution`: there is no second party contesting a prior ruling, just a
first-pass delivery check. Not `AI & Agents`: the AI is the judge, not the
product, and that label would bury the listing among lookalikes.

## Category tags
- **Category tag 1 — Delivery Verification** — `verify_delivery` renders the
  public proof URLs on-chain and rules whether the deliverable was delivered by
  the due date. This is the first thing every user meets.
- **Category tag 2 — Fulfilment Review** — the same ruling is a completion/quality
  inspection of the order against its acceptance rule, with DELIVERED / FAILED /
  INCONCLUSIVE outcomes.

Rejected: *Service Escrow* (there is a deposit, but the escrow is not the
distinctive part — the web-evidence verdict is), *Intelligent Auctions* /
*Dynamic Pricing* (no pricing or bidding logic in the contract).

## Logo
`frontend` favicon (inline SVG box-stack mark in the brand teal/amber).
Exportable to PNG 1024/512 on request. Concept: a parcel/box drawn as three
facets, reading as one delivery mark.

## One-liner (173 / 180)
Escrow a deposit behind a public delivery promise; GenLayer validators read the live proof page and rule whether it was delivered, then release the money to the right party.

## Description (964 / 1000)
DropProof is a public register for deliveries you can verify on a web page: a shipped release, a published report, a live endpoint, an updated tracking page. A seller opens an order against a buyer and funds a GEN deposit, with a plain-language deliverable, an acceptance rule, up to three public proof URLs, a due time and a review-by time.

After the due time, anyone triggers a review. GenLayer validators render the live proof pages on-chain and an LLM jury rules, under the exact rule: DELIVERED returns the deposit to the seller, FAILED credits it to the buyer, INCONCLUSIVE keeps the order open. If the review-by passes unresolved the order LAPSES and the deposit returns to the seller.

It is for sellers, buyers and escrow operators who need a neutral check of a public deliverable. No server or operator decides the outcome; the verdict and its written rationale come from validator consensus reading the real web, which a plain smart contract cannot do.

## How to try it
Prerequisites: a browser wallet (MetaMask). Reading the board needs no wallet.
To open or review an order you need a little GEN on Studionet (chain 61999) —
fund the wallet from the Studio **Accounts** panel; ~0.002 GEN covers the deposit
plus gas for one full round.

Step 1 — Browse the board. Open the app; you land on the delivery board with
resolved orders (DELIVERED and FAILED). Click one to read its deliverable,
acceptance rule, proof URLs, the validator verdict + confidence + rationale, and
the transaction link.

Step 2 — Connect and switch network. Click **Connect wallet**; approve, and the
app switches you to Studionet automatically.

Step 3 — Open an order. Go to **Open an order**. Enter a buyer address (any
address other than yours), a deliverable, an acceptance rule, and a public https
proof URL. For a quick demo set the due time ~3 minutes out and review-by ~15
minutes out. Enter a deposit (e.g. 0.001) and sign.

Step 4 — Run the review. After the due time passes, open your order and click
**Run validator review**. A loading state shows while validators render the page
and reach consensus (~15–40s). The verdict, confidence and rationale then appear.

Step 5 — Settle. On DELIVERED the deposit is credited back to you; open **My
account** and withdraw it.

Expected end state: your order shows a terminal status (DELIVERED / FAILED) with
an AI rationale, and the deposit has moved to the correct party.

If something goes wrong:
- "order is not due yet" — wait until the due time you set (Step 3), then retry
  the review.
- Wrong network — use the **Switch to Studionet** button in the header.
- Review returned INCONCLUSIVE — the page was unreadable or ambiguous; the order
  stays open, just run the review again (optionally with a clearer proof URL).

## Expected verification outcome (410 / 500)
Open the board without a wallet: it shows resolved orders with both DELIVERED (deposit returned to the seller) and FAILED (deposit credited to the buyer) outcomes, each with a confidence, a one-paragraph rationale, a committed evidence digest and a settled recipient, plus the matching withdrawals. Open an order to see the deliverable, the acceptance rule, the proof URLs and a link to the GenLayer transaction. The verdict, confidence and rationale are produced by validator consensus reading the live pages, not by the website.

## Contract link
https://explorer-studio.genlayer.com/address/0x5F31afD425C47583B4472830aF8bA2881314A9Af

Address: `0x5F31afD425C47583B4472830aF8bA2881314A9Af`
Network: GenLayer Studionet (chain 61999)
Status: **Preview** (Studio-hosted)
Verified: deployed and exercised by separate seller and buyer wallets with a
comprehensive end-to-end suite (`scripts/e2e_studionet.py`) in which every write
is gated on `FINALIZED` (a bare `ACCEPTED` is never treated as proof): invalid-
buyer rejection + recovery, DELIVERED, FAILED, unavailable-source INCONCLUSIVE,
no-timestamp INCONCLUSIVE, lapse recovery, failed-payment recovery, and
withdrawals by both parties with real native-balance deltas — all backed by
finalized state readbacks, the committed evidence digest and Explorer tx links.
The board also renders the resolved orders to an anonymous visitor (confirmed in
a browser with no wallet connected). A captured live run with Explorer
transaction links, finalized readbacks and the real recipient-wallet balance
change is in `docs/STUDIONET_E2E.md`.

## Website
https://dropproof.vercel.app

## GitHub
https://github.com/phu1271997/dropproof

## Community links (optional)
—
