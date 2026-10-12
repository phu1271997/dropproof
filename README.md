# DropProof

**A fulfilment-escrow register for externally verifiable deliveries, judged by GenLayer validator consensus.**

- **Live app:** https://dropproof.vercel.app _(updated after deploy)_
- **Network:** GenLayer **Studionet** (chain `61999`, RPC `https://studio.genlayer.com/api`) — Explorer status is **Preview**
- **Contract:** [`0x1F4e2901FaDa9E50753325340CFdeD3349A5D2b0`](https://explorer-studio.genlayer.com/address/0x1F4e2901FaDa9E50753325340CFdeD3349A5D2b0)

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

## Contract quality

- The nondet block returns `{verdict, confidence, reason}`; consensus is reached
  with `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` where the validator
  agrees only when it lands on the **same verdict** and a **comparable confidence
  band** — never on JSON shape. Two validators that disagree on the verdict cannot
  both pass.
- Explicit handling + `UserError` for: unreadable/empty pages (→ `INCONCLUSIVE`),
  non-https or duplicate URLs, zero deposit, out-of-range review window, buyer ==
  seller, double-settlement, acting on a terminal order, withdrawing more than
  credited.
- Multi-source: up to three independent proof URLs are rendered and cross-weighed
  in one ruling.
- A **payable-custody safety**: because Studionet credits value to a payable
  contract even on a later execution error, invalid terms return a `REJECTED`
  sentinel and hold the deposit as withdrawable credit instead of stranding it.

## Repository layout

```
contracts/dropproof.py     # the Intelligent Contract
scripts/deploy.py          # studionet deploy (genlayer_py) + --check-only schema check
scripts/seed.py            # seed 1 DELIVERED + 1 FAILED + a withdrawal
scripts/build.mjs          # inject CONTRACT_ADDRESS into the frontend at build
frontend/                  # single-page app (genlayer-js + MetaMask), no backend
```

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

## Seed demo data

```bash
source ~/.genlayer/env.sh
python3 scripts/seed.py 0x<contract>        # DELIVERED, FAILED, then a withdrawal
```
