# Franchiser

`Franchiser` allows holders of checkpoint voting tokens to selectively sub-delegate voting power while retaining full custody over their funds, as described in the [design document](./spec.md).

The system ships two parallel delegation paths:

- **FranchiserFactory** — permissionless; any token holder can delegate directly.
- **FranchiserPool / FranchiserPoolFactory** — governance-controlled; a Coordinator distributes tokens from a shared pool to multiple top-level delegatees, with a Guardian providing emergency freeze and recall capabilities.

- **License:** GPL-3.0-or-later
- **Security contact:** See the [Trail of Bits audit](https://github.com/NoahZinsmeister/franchiser/compare/e652c7fe1716bc8e9ca1bb929238313eabb9ea52...main) of the original Franchiser codebase.
- **Solidity:** 0.8.35

---

## Table of Contents

- [Architecture](#architecture)
  - [Contracts](#contracts)
  - [Roles](#roles)
  - [Flows](#flows)
  - [Configuration Setters](#configuration-setters)
- [Installation](#installation)
- [Build & Compile](#build--compile)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contract Documentation](#contract-documentation)

---

## Architecture

### Contracts

| Contract | Description |
|---|---|
| `Franchiser` | Clone-deployed per delegation. Holds tokens, delegates votes to `delegatee`, allows one level of sub-delegation via `subDelegate`. |
| `FranchiserFactory` | Permissionless factory. Any holder can `fund` a delegatee; the factory owns the resulting `Franchiser` clone. Supports batch operations and EIP-2612 permit. |
| `FranchiserPool` | Governance-created pool. A Coordinator distributes tokens to many delegatees (each backed by a `Franchiser` clone). A Guardian can freeze the pool or emergency-recall delegatees. |
| `FranchiserPoolFactory` | Governance's sole entry point for creating, funding, halting, and reconfiguring `FranchiserPool` instances. |
| `FranchiserLens` | Read-only view helper. Traverses delegation trees to return root, vertical, and horizontal delegation data with vote balances. |

Franchiser clones use deterministic CREATE2 addresses (via OpenZeppelin `Clones`), so a clone's address can be predicted before deployment with `getFranchiser`.

**Key constants**

| Constant | Value | Meaning |
|---|---|---|
| `DECAY_FACTOR` | `2` | Each sub-delegation level halves `maximumSubDelegatees`. |
| `INITIAL_MAXIMUM_SUBDELEGATEES` | `1` | Direct delegatees (from a pool or factory) may sub-delegate exactly once. |
| `MINIMUM_FREEZE_PERIOD` | `10 days` | Minimum duration of a guardian-triggered freeze. |

### Roles

**Governance**
Controls `FranchiserPoolFactory`. Creates, funds, halts, and reconfigures pools. The only address allowed to call any function on the factory.

**Coordinator**
Assigned per pool. Manages the live delegation set within a `FranchiserPool`: delegates tokens to new delegatees, recalls them, and reassigns between delegatees. Coordinator actions are blocked while a pool is frozen.

**Guardian**
Assigned per pool. Provides emergency capabilities that remain available even while a pool is frozen: selectively recall specified delegatees, freeze the pool (blocking the coordinator), or freeze-and-recall-all in a single call.

**Funder**
Any token holder using `FranchiserFactory` directly. The funder is the `delegator` of record and is the only one who can recall their tokens.

**Delegatee**
Receives voting power from either the factory or a pool. May call `subDelegate` on their `Franchiser` clone to push a portion of voting power to one sub-delegatee (because `INITIAL_MAXIMUM_SUBDELEGATEES = 1`). Sub-delegatees cannot further sub-delegate (`1 / DECAY_FACTOR = 0`).

### Flows

#### FranchiserFactory — direct delegation

```
1. Funder calls fund(delegatee, amount)
   └─ Factory deploys Franchiser clone if needed
   └─ Transfers amount from funder to Franchiser
   └─ Franchiser delegates votes to delegatee

2. Delegatee calls franchiser.subDelegate(subDelegatee, amount)
   └─ Moves amount into a new sub-Franchiser
   └─ Sub-delegatee receives voting power

3. Funder calls recall(delegatee, recipient)
   └─ Franchiser.recall() drains all sub-franchisers first
   └─ Full balance returned to recipient
```

Batch variants `fundMany` / `recallMany` and the gasless `permitAndFund` / `permitAndFundMany` (EIP-2612) are also available.

#### FranchiserPool — pool delegation

```
1. Governance calls FranchiserPoolFactory.createPool(
       coordinator, guardian, maxDelegatees, freezePeriod, initialAmount)
   └─ Deploys a FranchiserPool
   └─ Transfers initialAmount from governance to pool (if > 0)

2. Governance calls fundPool(pool, amount)       ← pulls from governance wallet
              or  transferToPool(pool, amount)   ← pushes from factory balance

3. Coordinator calls pool.delegate(delegatee, amount)
   └─ Deploys Franchiser clone for delegatee if needed
   └─ Transfers amount from pool to Franchiser
   └─ Delegatee receives voting power

4. Coordinator calls pool.recall(delegatee)
   └─ Drains Franchiser (including sub-delegatees) back to pool
   └─ Delegatee removed from active set

5. Coordinator calls pool.reassign(from, to, amount)
   └─ Recalls from `from`, then delegates `amount` to `to`

6. Guardian calls pool.emergencyFreezePool()
   └─ Sets frozenUntil = block.timestamp + freezePeriod
   └─ Blocks all coordinator actions until freeze expires

7. Guardian calls pool.emergencyFreezeAndRecallPool()
   └─ Recalls all active delegatees, then freezes

8. Guardian calls pool.emergencyRecallDelegatees([addr1, addr2, ...])
   └─ Recalls specific delegatees; works even while frozen

9. Governance calls factory.unfreezePool(pool)
   └─ Clears frozenUntil immediately

10. Governance calls factory.haltPool(pool, recipient)
    └─ Recalls all delegatees
    └─ Transfers full pool balance to recipient
```

### Configuration Setters

All setters are called on `FranchiserPoolFactory` and are restricted to Governance. Each validates the target pool is known.

| Function | Description |
|---|---|
| `setCoordinator(pool, newCoordinator)` | Replace the pool's coordinator. Reverts if `newCoordinator` is zero. |
| `setGuardian(pool, newGuardian)` | Replace the pool's guardian. Reverts if `newGuardian` is zero. |
| `setMaxDelegatees(pool, max)` | Adjust the cap on active delegatees. Takes effect on the next `delegate` call. |
| `setFreezePeriod(pool, period)` | Adjust the freeze duration. Must be ≥ `MINIMUM_FREEZE_PERIOD` (10 days). |

---

## Installation

```bash
git clone <repo-link>
cd franchiser
pnpm i
```

---

## Build & Compile

```bash
# Compile Solidity contracts
pnpm build
```

```bash
# Clean all build artifacts
pnpm clean
```

---

## Testing

```bash
# Run all tests
pnpm test
```

```bash
# Test coverage
pnpm coverage
```

```bash
# Static analysis (Slither + Aderyn)
pnpm gen:security-reports
```

---

## Deployment

Deployment uses [Hardhat Ignition](https://hardhat.org/ignition/docs/getting-started).

### Deploy to mainnet

```bash
# Deploy FranchiserFactory with the address of the voting token (e.g. COMP for a Compound deployment)
pnpm hardhat ignition deploy ignition/modules/FranchiserFactory.ts \
      --network mainnet \
      --deployment-id franchiser-factory \
      --parameters '{"FranchiserFactory":{"votingToken":"0x..."}}'
```

```bash
# Deploy FranchiserPoolFactory with the address of the voting token and governance (e.g. COMP for a Compound deployment)
pnpm hardhat ignition deploy ignition/modules/FranchiserPoolFactory.ts \
      --network mainnet \
      --deployment-id franchiser-pool-factory \
      --parameters '{"FranchiserPoolFactory":{"votingToken":"0x...","governance":"0x..."}}'
```
---

## Contract Documentation

Contract documentation is auto-generated from NatSpec comments:

```bash
pnpm gen:docs
```

Generated markdown is written to `docs/`.
