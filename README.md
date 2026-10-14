# DropProof

**A fulfilment-escrow register for externally verifiable deliveries, judged by GenLayer validator consensus.**

- **Live app:** https://dropproof.vercel.app _(updated after deploy)_
- **Network:** GenLayer **Studionet** (chain `61999`, RPC `https://studio.genlayer.com/api`) — Explorer status is **Preview**
- **Contract:** [`0x5F31afD425C47583B4472830aF8bA2881314A9Af`](https://explorer-studio.genlayer.com/address/0x5F31afD425C47583B4472830aF8bA2881314A9Af)

## The problem

Two parties agree a delivery with money on the line — a release shipped, a report
published, an endpoint brought live, a tracking page updated — and the deliverable
is visible on a public web page. Who decides whether it actually happened on time?
A centralized escrow operator can be captured or simply disappear; a pure Solidity
escrow cannot *read a web page* or judge a plain-language acceptance rule.

## How DropProof works

A seller opens an **order** against a buyer and funds a native **GEN deposit**:

- a plain-language **deliverable** (the public promise),
- an **acceptance rule** (how to judge it),
- 1–3 public **proof URLs**,
- a **due time** and a final **review-by** time.

After the due time, anyone calls `verify_delivery`. GenLayer validators **render
the live proof pages on-chain** (`gl.nondet.web.render`) and an **LLM jury**
(`gl.nondet.exec_prompt`) rules — under the exact acceptance rule, as of the due
date — one of:

| Verdict | Consequence |
|---|---|
| `DELIVERED` | deposit credited back to the **seller** |
| `FAILED` | deposit credited to the **buyer** |
| `INCONCLUSIVE` | no winner invented; order stays open, reviewable again |
| `LAPSED` (after review-by, unresolved) | deposit returns to the seller, result stays on record |

Settlement is idempotent and funds are pulled with `withdraw`.

## Why it dies without GenLayer

The core decision is **semantic and evidence-dependent**: *does the live public
evidence establish that this deliverable was fulfilled on time, under this rule?*
That needs on-chain web retrieval **plus** language judgment — neither of which
Solidity can do — and it must not be controlled by the seller, the buyer, or this
site. GenLayer supplies validator-side web rendering, model judgment and
consensus; the contract supplies authorization, custody and settlement. Remove
the AI/web layer and there is nothing left but a trust-me escrow.

## Contract quality & security hardening

- **Strict, contract-level address validation.** `open_order` validates the buyer
  with `Address(...)` (exact 20-byte wallet, nonzero, ≠ seller) *inside the
  contract* — the frontend check is only a convenience. A malformed buyer can
  never reach storage, so a FAILED remedy can never be credited to an address
  that cannot withdraw.
- **Strict verdict parsing.** `_strict_verdict` honours only an exact match to
  `DELIVERED`/`FAILED`/`INCONCLUSIVE`. Malformed output (e.g.
  `NOT_ENOUGH_EVIDENCE`) can never be read as `FAILED`/`DELIVERED` via substrings;
  anything unsupported becomes `INCONCLUSIVE` and moves no money.
- **Consensus on the evidence, not just the verdict.** Each juror commits a
  keccak-256 digest (`evidence_digest`) over the exact, normalised evidence it
  retrieved. A validator agrees only when it lands on the **same strict verdict**,
  a **comparable confidence band**, **and the same evidence commitment** — a
  validator that read different page content forces a rotation.
- **Authoritative timing.** The jury is required to find an authoritative
  timestamp (published/release date, changelog entry…) establishing delivery on
  or before the due date; a page merely existing now is not accepted as proof.
- **Conservative evidence handling.** Every listed proof URL is *mandatory*: a
  single missing/unreadable source yields `INCONCLUSIVE`. Truncated documents are
  flagged and must not be read as `DELIVERED` for content beyond the retrieved
  portion.
- **Buyer protection on lapse.** `lapse_order` never sweeps an *unreviewed* claim
  back to the seller: if the review window closed with zero reviews it runs one
  final authoritative review and settles on its verdict; only a genuine
  `INCONCLUSIVE` lapses the deposit back to the seller.
- **Claimable ≠ paid.** A ruling marks the order `CREDITED` (a claimable balance),
  not `PAID`. `get_account` exposes `claimable` vs cumulative `withdrawn`.
  `withdraw` debits and emits the native transfer `on="finalized"` in the same
  transaction, so the debit and the send commit or roll back together (a failed
  withdrawal leaves the credit intact and re-claimable; a successful one cannot be
  replayed).
- Explicit `UserError` handling for non-https/duplicate URLs, zero deposit,
  out-of-range review window, acting on a terminal order and over-withdrawal; and
  a **payable-custody safety** — invalid terms return a `REJECTED` sentinel and
  hold the deposit as the seller's withdrawable credit instead of stranding it.

## Repository layout

```
contracts/dropproof.py     # the Intelligent Contract
scripts/deploy.py          # studionet deploy (genlayer_py) + --check-only schema check
scripts/seed.py            # quick demo seed: 1 DELIVERED + 1 FAILED + a withdrawal
scripts/e2e_studionet.py   # full StudioNet e2e: 2 wallets, invalid buyer, DELIVERED,
                           #   FAILED, finalized readbacks, tx links, balance changes
tests/test_direct.py       # Direct Mode suite (gltest, mocked web/LLM + warped clock)
scripts/build.mjs          # inject CONTRACT_ADDRESS into the frontend at build
frontend/                  # single-page app (genlayer-js + MetaMask), no backend
```

## Tests

**Direct Mode** (no network, no docker — mocked web/LLM and a warped clock):

```bash
python3 tests/test_direct.py
```

Covers valid/invalid buyer addresses, strict verdict parsing (malformed model
output never settles), historical deadlines, contradictory/unavailable/missing/
truncated evidence, inconclusive outcomes, validator consensus on the evidence
commitment, lapse recovery, settlement states and withdrawals by both parties
with failed-payment recovery.

**StudioNet end-to-end** (live consensus; separate seller & buyer wallets):

```bash
source ~/.genlayer/env.sh
python3 scripts/e2e_studionet.py 0x<contract>
```

Every write is **gated on `FINALIZED`** — a transaction that only reaches
`ACCEPTED` is reported as *not final* and is never treated as proof. The suite
covers, each with a finalized state readback, the committed evidence digest, an
Explorer tx link and real native-balance deltas:

| # | Scenario | Demonstrated |
|---|---|---|
| 1 | invalid buyer address | `REJECTED`; deposit held as seller credit and recovered |
| 2 | DELIVERED (historical, timestamped immutable artifact) | seller credited |
| 3 | FAILED (authoritative timestamp contradicts the claim) | buyer credited |
| 4 | unavailable mandatory source | `INCONCLUSIVE` — ungrounded/unsupported output cannot settle money |
| 5 | readable page, no authoritative timestamp | `INCONCLUSIVE`, order stays OPEN and reviewable |
| 6 | lapse recovery | a final authoritative review runs before an unresolved deposit returns to the seller |
| 7 | failed-payment recovery | an over-withdrawal finalizes with an error and leaves the credit intact and re-claimable |
| 8 | withdrawals by both parties | real native-balance deltas for seller and buyer |

*Malformed model output* cannot be forced against a live model, so the strict
verdict coercion is validated deterministically in Direct Mode (where the LLM is
mockable); scenario 4 proves the on-chain *consequence* — unsupported output
never moves money.

## Deploy to Studionet

```bash
source ~/.genlayer/env.sh                 # exports GENLAYER_PRIVATE_KEY
python3 scripts/deploy.py --check-only     # validate the schema, no spend
python3 scripts/deploy.py                  # deploy to chain 61999
```

Put the printed address in `.env` as `CONTRACT_ADDRESS=0x…`.

## Run the frontend

```bash
node scripts/build.mjs                      # injects the address from .env
npx serve frontend                          # or any static server
```

The app signs with MetaMask (no private key ships in the bundle), auto-switches
the wallet to Studionet, shows a loading state while consensus runs, and renders
the validator's verdict **and rationale** with a link to the transaction on the
Explorer.

**Finalization-gated success.** The UI never reports success on a bare
`ACCEPTED`. Every write waits for `FINALIZED` and only then runs a
transaction-specific state readback (the order exists with the expected terms;
the order moved to a terminal status or `review_count` rose; the claimable
balance actually dropped). If a transaction is accepted but not yet finalized,
the UI shows a distinct *pending* state — not success; if it finalizes but the
expected state change is absent, it reports a finalized-with-error failure.

## Seed demo data

```bash
source ~/.genlayer/env.sh
python3 scripts/seed.py 0x<contract>        # DELIVERED, FAILED, then a withdrawal
```
