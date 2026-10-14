# StudioNet end-to-end evidence

Live run of `scripts/e2e_studionet.py` against the deployed contract
[`0x5F31afD425C47583B4472830aF8bA2881314A9Af`](https://explorer-studio.genlayer.com/address/0x5F31afD425C47583B4472830aF8bA2881314A9Af)
(GenLayer StudioNet, chain 61999), with **separate seller and buyer wallets**:

- seller `0x8b563A8c9eeF530300e92E26457D1AB001daEcC7`
- buyer  `0xFdc45874126A0580d9A9d034F2AA20d9bdad8235`

Every write is gated on **`FINALIZED`** (a bare `ACCEPTED` is never treated as
proof) and every outcome is confirmed by an authoritative on-chain state
readback. All transaction hashes below are permanent on the StudioNet Explorer.
Reproduce with:

```bash
source ~/.genlayer/env.sh
python3 scripts/e2e_studionet.py 0x5F31afD425C47583B4472830aF8bA2881314A9Af
```

## Results (all FINALIZED)

| # | Scenario | Order | Verify/settle tx | On-chain readback |
|---|---|---|---|---|
| 1 | invalid buyer address → REJECTED + recovery | — | [open](https://explorer-studio.genlayer.com/tx/0x6de8bfe130e07c2f1227dcbe19a28d42e00dd791ad60774440be5d39ed299991) · [recover](https://explorer-studio.genlayer.com/tx/0x5eb34bf500fc8611766cb690ac643425e6f608ae3c2658a408e2d5122c5fdb55) | `UserError: buyer must be a valid 20-byte 0x wallet address`; no order created; deposit held as seller credit and withdrawn back |
| 2 | **DELIVERED** (python.org 3.13.0, authoritative release date) | #15 | [verify](https://explorer-studio.genlayer.com/tx/0xa97fd4874396093e7848e224414680904ba378bec0763af3dea214ba511f9734) | `verdict=DELIVERED confidence=100 status=DELIVERED settlement=CREDITED` → seller credited |
| 3 | **FAILED** (authoritative date contradicts the claim) | #16 | [verify](https://explorer-studio.genlayer.com/tx/0xca43af27c99f77182d5da9e317eda6afebb68a0f3589e74d6f2f78a82c56cc09) | `verdict=FAILED confidence=97 status=FAILED settlement=CREDITED` → buyer credited |
| 4 | **unavailable** mandatory source → INCONCLUSIVE | #17 | [verify](https://explorer-studio.genlayer.com/tx/0x889f31c5fdbcd1a1e10e4b5dc08fdd9a2663f0db494a085514f82a760d3da60e) | `verdict=INCONCLUSIVE status=OPEN settlement=LOCKED reviews=1` → no money moved; dead source cannot settle even though the model would otherwise rule |
| 5 | **no authoritative timestamp** → never DELIVERED | #18 | [verify](https://explorer-studio.genlayer.com/tx/0x92d1354f20be78ff0ae013a75f12ad127b448be59e87d1c75aaf409bc74f34ba) | `verdict=FAILED confidence=95` → money-safe (not DELIVERED; credited the buyer, never the seller) |
| 6 | **lapse recovery** (buyer protection) | #14 | [lapse](https://explorer-studio.genlayer.com/tx/0xba69dc5725bc3400aa827afff2bfd911e90941bf2d9ac01b2fd7631ae4a50f2f) | unreviewed at review-by → final authoritative review ran (`reviews=1`) → `FAILED`, credited the **buyer** (not swept to the seller) |
| 7 | **failed-payment recovery** (over-withdrawal) | — | [over-withdraw](https://explorer-studio.genlayer.com/tx/0x916d747cdc9da1c4dc9446444c9c59b8939ad38bbd82c8cf120757355e2501ae) | withdrawal of `credit+1` errors; seller claimable unchanged (`1000000000000000 → 1000000000000000 wei`) — funds intact and re-claimable |
| 8 | **withdrawals by both parties** (native balance change) | — | [seller](https://explorer-studio.genlayer.com/tx/0x622b2d05cf7f2654c84e815d2d7c26a9b44ecb1da4d27d8c556b94d6033a1d36) · [buyer](https://explorer-studio.genlayer.com/tx/0xb377c9203fe4a72fc977e626f98c49dd245b06939b921969cc77a2a749ba3adf) | both claimable → `0`; **buyer native +0.005 GEN** (`…907399999999971796 → …912399999999971796`), seller credit consumed and `withdrawn` recorded — confirmed finalized by readback |

## Notes

- **Consensus is real.** The DELIVERED (conf 100) and FAILED (conf 97) rulings on
  the live `python.org` release page passed the contract's strict **evidence-digest
  consensus**: validators agreed on the same strict verdict, a comparable
  confidence band, **and the same keccak commitment to the evidence they
  retrieved** — not just the final verdict. Transaction `consensus_data` shows the
  validator votes agreeing.
- **FINALIZED ≠ success.** The suite distinguishes a finalized ruling from a
  finalized-with-error transaction; e.g. a `verify_delivery` after the review
  window closes finalizes but applies no ruling, and is not reported as success.
- **Malformed model output** cannot be forced against a live model; its strict
  coercion to INCONCLUSIVE is proven deterministically in Direct Mode
  (`tests/test_direct.py`, where the LLM is mockable). Scenario 4 proves the
  on-chain consequence: unsupported / ungrounded output can never settle money.
- The StudioNet gateway is intermittently slow; the script retries transient
  gateway failures and is bounded by a wall-clock budget so it always terminates
  with a summary. Order review windows are set to 1 hour so a slow gateway can
  never close a window before the review runs.
