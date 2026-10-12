#!/usr/bin/env python3
"""Deploy the DropProof Intelligent Contract to GenLayer studionet.

Usage:
    source ~/.genlayer/env.sh          # exports GENLAYER_PRIVATE_KEY
    python3 scripts/deploy.py                 # pre-flight schema check + deploy
    python3 scripts/deploy.py --check-only    # schema check only, no spend
"""
import json
import os
import sys

import genlayer_py as g
from genlayer_py import chains
from genlayer_py.types import TransactionStatus

CONTRACT = os.path.join(os.path.dirname(__file__), "..", "contracts", "dropproof.py")


def _extract_address(receipt) -> str:
    def dig(obj, *keys):
        cur = obj
        for k in keys:
            if cur is None:
                return None
            cur = cur.get(k) if isinstance(cur, dict) else getattr(cur, k, None)
        return cur

    for path in (("contract_address",), ("data", "contract_address"),
                 ("to",), ("tx_data_decoded", "contract_address")):
        v = dig(receipt, *path)
        if isinstance(v, str) and v.startswith("0x") and len(v) >= 42:
            return v
    return ""


def main() -> int:
    check_only = "--check-only" in sys.argv
    with open(CONTRACT, "rb") as fh:
        code = fh.read()

    key = os.environ.get("GENLAYER_PRIVATE_KEY")
    if not key:
        print("ERROR: GENLAYER_PRIVATE_KEY not set. Run: source ~/.genlayer/env.sh")
        return 2

    account = g.create_account(key)
    client = g.create_client(chain=chains.studionet, account=account)

    print("Pre-flight: validating contract schema ...")
    schema = client.get_contract_schema_for_code(code)
    methods = list(getattr(schema, "methods", {}) or {})
    print("  schema OK, methods:", methods or "(see schema)")
    if check_only:
        print("--check-only: not deploying.")
        return 0

    print("Deploying to studionet (chain 61999) ...")
    tx_hash = client.deploy_contract(code=code, account=account)
    print("  tx:", tx_hash)
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash, status=TransactionStatus.ACCEPTED,
        interval=5000, retries=100,
    )
    addr = _extract_address(receipt)
    print("Deployed. contract address:", addr or "(inspect receipt below)")
    if not addr:
        try:
            print(json.dumps(receipt, indent=2, default=str)[:2000])
        except Exception:
            print(receipt)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
