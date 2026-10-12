#!/usr/bin/env python3
"""Seed DropProof with one DELIVERED + one FAILED order, then withdraw.

    source ~/.genlayer/env.sh
    python3 scripts/seed.py 0x<contract>
"""
import json
import os
import sys
import time

import genlayer_py as g
from genlayer_py import chains
from genlayer_py.types import TransactionStatus

DEPOSIT = 10 ** 15  # 0.001 GEN
LEAD = 75           # seconds until the order is due


def main() -> int:
    addr = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DROPPROOF_ADDR", "")
    if not addr:
        print("usage: python3 scripts/seed.py 0x<contract>")
        return 2
    seller = g.create_account(os.environ["GENLAYER_PRIVATE_KEY"])
    buyer = g.create_account(os.environ["GENLAYER_PRIVATE_KEY_2"])
    cl = g.create_client(chain=chains.studionet, account=seller)

    due_at = int(time.time()) + LEAD
    review_by = due_at + 6 * 60

    cases = [
        ("DELIVERED",
         "Python 3.13.0 final has been released and is published on python.org.",
         "The proof page must show that Python 3.13.0 has been released.",
         ["https://www.python.org/downloads/release/python-3130/"]),
        ("FAILED",
         "The python.org downloads page states that the current latest stable Python release is version 2.0.",
         "The proof page must confirm the latest stable Python release is version 2.0.",
         ["https://www.python.org/downloads/"]),
    ]

    opened = []
    for label, deliverable, rule, urls in cases:
        print(f"\n== opening [{label}] ==")
        tx = cl.write_contract(address=addr, function_name="open_order",
                               value=DEPOSIT, account=seller,
                               args=[buyer.address, deliverable, rule, urls, due_at, review_by])
        print("  open tx:", tx)
        cl.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.ACCEPTED,
                                        interval=4000, retries=140)
        count = int(cl.read_contract(address=addr, function_name="get_order_count", args=[]))
        oid = str(count - 1)
        print("  opened id:", oid)
        opened.append((label, oid))

    wait = max(0, due_at - int(time.time())) + 8
    print(f"\nwaiting {wait}s for orders to reach the due time ...")
    time.sleep(wait)

    for label, oid in opened:
        print(f"\n== verifying id {oid} (expect {label}) ==")
        tx = cl.write_contract(address=addr, function_name="verify_delivery",
                               account=seller, args=[oid])
        print("  verify tx:", tx)
        cl.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.ACCEPTED,
                                        interval=4000, retries=160)
        rec = json.loads(cl.read_contract(address=addr, function_name="get_order", args=[oid]))
        print(f"  verdict={rec['verdict']} status={rec['status']} conf={rec['confidence']} recipient={rec['recipient']}")
        print("  reason:", rec["reason"])

    cr = int(cl.read_contract(address=addr, function_name="get_credit", args=[seller.address]))
    print("\nseller credit after settlement:", cr)
    if cr > 0:
        tx = cl.write_contract(address=addr, function_name="withdraw", account=seller, args=[cr])
        print("withdraw tx:", tx)
        cl.wait_for_transaction_receipt(transaction_hash=tx, status=TransactionStatus.ACCEPTED,
                                        interval=4000, retries=140)
        print("seller credit after withdraw:",
              int(cl.read_contract(address=addr, function_name="get_credit", args=[seller.address])))
    print("done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
