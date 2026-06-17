# Franchiser — Design Specification

This document describes the design of the Franchiser system, which allows a governance-controlled pool of checkpoint voting tokens to be distributed to multiple top-level delegatees, while the underlying tokens remain under the custody of the pool.

Familiarity with checkpoint voting tokens (e.g. [Compound COMP](https://compound.finance/docs/governance#comp)) is assumed.

---

## Motivation

Token holders (here: a DAO governed by a timelock) often want to distribute voting power across many delegates without permanently transferring token custody. The Franchiser system solves this by wrapping each delegation in a dedicated contract that can be recalled at any time.

---

## System Components

### Franchiser

The primitive delegation unit. Each `Franchiser` is a minimal EIP-1167 proxy clone that:

- Holds a balance of voting tokens.
- Automatically delegates all votes to a fixed `delegatee` address (set at clone initialisation, never changed).
- Allows its `owner` to call `recall(to)` at any time to drain the balance (including any sub-delegated amounts) back to `to`.
- Allows the `delegatee` to push a portion of voting power one level deeper via `subDelegate(subDelegatee, amount)`.

Clones are deployed at deterministic CREATE2 addresses, so the address of a future clone can be predicted with `getFranchiser` before it is deployed.

### FranchiserPool

A pool that a single governance entity seeds with tokens and a coordinator distributes to multiple top-level delegatees. Each delegatee is backed by a dedicated `Franchiser` clone owned by the pool.

Key state:

| Field | Description |
|---|---|
| `votingToken` | The checkpoint ERC-20 being delegated. |
| `factory` | The `FranchiserPoolFactory` that deployed this pool. Immutable. |
| `coordinator` | Address authorised to delegate, recall, and reassign within the pool. |
| `guardian` | Address authorised to emergency-freeze and emergency-recall. |
| `maxDelegatees` | Cap on simultaneous active top-level delegatees (1 – `DELEGATEES_LIMIT`). |
| `freezePeriod` | Duration applied to future guardian-triggered freezes. |
| `frozenUntil` | Timestamp until which coordinator actions are blocked. `0` = not frozen. |
| `_activeDelegatees` | Enumerable set of addresses that currently have a funded Franchiser. |

### FranchiserPoolFactory

Governance's sole entry point. All functions are restricted to the hardcoded `governance` address. Maintains an enumerable set of all pools it has deployed.

---

## Roles

### Governance

Hardcoded constant in `FranchiserPoolFactory` (`0x6d903f6003cca6255D85CcA4D3B5E5146dC33925` — the Compound timelock). Exclusively controls all factory functions: creating, funding, halting, and reconfiguring pools.

### Coordinator

Assigned per pool. Responsible for the live delegation set during normal operation:

- `delegate(delegatee, amount)` — push tokens from the pool to a delegatee's Franchiser clone.
- `recall(delegatee)` — drain a delegatee's Franchiser back to the pool.
- `reassign(from, to, amount)` — atomically recall `from` and delegate `amount` to `to`.

All coordinator actions revert while the pool is frozen (`block.timestamp < frozenUntil`).

### Guardian

Assigned per pool. Provides emergency capabilities that remain available regardless of freeze state:

- `emergencyRecallDelegates(delegatees[])` — selectively recall specific delegatees. Array length must be less than `maxDelegatees`.
- `emergencyFreezePool()` — freeze the pool for `freezePeriod` without recalling anyone.
- `emergencyFreezeAndRecallPool()` — recall all active delegatees, then freeze.

### Delegatee

Receives voting power from the pool via their Franchiser clone. May push a portion of that voting power one level deeper:

- `franchiser.subDelegate(subDelegatee, amount)` — delegates `amount` to `subDelegatee` via a nested Franchiser clone.

Sub-delegatees cannot sub-delegate further (`INITIAL_MAXIMUM_SUBDELEGATEES / DECAY_FACTOR = 0`).

---

## Sub-Delegation Tree

```
FranchiserPool
└─ Franchiser(delegatee_A)        [maximumSubDelegatees = 1]
│     └─ Franchiser(subDelegatee) [maximumSubDelegatees = 0, cannot sub-delegate]
└─ Franchiser(delegatee_B)        [maximumSubDelegatees = 1]
│     └─ Franchiser(subDelegatee) [maximumSubDelegatees = 0, cannot sub-delegate]
└─ ... (up to maxDelegatees active at once)
```

Each top-level delegatee may have at most **one** sub-delegatee (`INITIAL_MAXIMUM_SUBDELEGATEES = 1`). The `DECAY_FACTOR = 2` halves the sub-delegation allowance at each nesting level, so the tree is exactly two levels deep.

When the pool owner recalls a top-level delegatee, the Franchiser's `recall` traverses and drains the sub-delegatee's Franchiser first, collapsing the full subtree in one call.

---
