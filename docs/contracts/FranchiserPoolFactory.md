# FranchiserPoolFactory

## Overview

#### License: GPL-3.0-or-later

```solidity
contract FranchiserPoolFactory is IFranchiserPoolFactory, FranchiserImmutableState
```

Governance's sole entry point for creating, funding, and halting
FranchiserPool programs, and for adjusting their parameters.
All functions are restricted to the immutable governance address.
## Constants info

### MINIMUM_FREEZE_PERIOD (0x82d73663)

```solidity
uint256 constant MINIMUM_FREEZE_PERIOD = 10 days
```


## State variables info

### governance (0x5aa6e675)

```solidity
address immutable governance
```


### isKnownPool (0x0de9f502)

```solidity
mapping(address => bool) isKnownPool
```


## Modifiers info

### onlyGovernance

```solidity
modifier onlyGovernance()
```


### onlyKnownPool

```solidity
modifier onlyKnownPool(address pool)
```


## Functions info

### constructor

```solidity
constructor(
    IVotingToken votingToken_,
    address governance_
) FranchiserImmutableState(votingToken_)
```


### createPool (0x85ac165a)

```solidity
function createPool(
    address coordinator_,
    address guardian_,
    uint256 maxDelegatees_,
    uint256 freezePeriod_,
    uint256 amount
) external onlyGovernance returns (FranchiserPool pool)
```

Deploys a new FranchiserPool and optionally seeds it with COMP.

Requires governance to have approved this contract for `amount`.
Reverts if `freezePeriod` is below `MINIMUM_FREEZE_PERIOD`.


Parameters:

| Name           | Type    | Description                                                        |
| :------------- | :------ | :----------------------------------------------------------------- |
| coordinator_   | address | The initial coordinator address.                                   |
| guardian_      | address | The initial guardian address.                                      |
| maxDelegatees_ | uint256 | The maximum number of simultaneous top-level delegatees.           |
| amount         | uint256 | The initial COMP amount to transfer from governance to the pool.   |
| freezePeriod_  | uint256 | The initial emergency freeze duration (>= MINIMUM_FREEZE_PERIOD).  |


Return values:

| Name | Type                    | Description                        |
| :--- | :---------------------- | :--------------------------------- |
| pool | contract FranchiserPool | The newly deployed FranchiserPool. |

### fundPool (0x2bfd5146)

```solidity
function fundPool(
    address pool,
    uint256 amount
) external onlyGovernance onlyKnownPool(pool)
```

Transfers additional COMP from governance to an existing pool.

Requires governance to have approved this contract for `amount`.
### transferToPool (0xd7efa129)

```solidity
function transferToPool(
    address pool,
    uint256 amount
) external onlyGovernance onlyKnownPool(pool)
```

Transfer `amount` of COMP from factory balance to `pool`.

Should be used if COMP was transferred to the factory outside of `fundPool`
### haltPool (0xc902112d)

```solidity
function haltPool(
    address pool,
    address recipient
) external onlyGovernance onlyKnownPool(pool)
```

Recalls all delegatees of `pool` and transfers all COMP to `recipient`.
### setCoordinator (0xe56e7cca)

```solidity
function setCoordinator(
    address pool,
    address coordinator_
) external onlyGovernance onlyKnownPool(pool)
```

Replaces the coordinator of `pool`.
### setGuardian (0x33c509d1)

```solidity
function setGuardian(
    address pool,
    address guardian_
) external onlyGovernance onlyKnownPool(pool)
```

Replaces the guardian of `pool`.
### setMaxDelegatees (0x05585686)

```solidity
function setMaxDelegatees(
    address pool,
    uint256 maxDelegatees_
) external onlyGovernance onlyKnownPool(pool)
```

Updates the maximum delegatee cap of `pool`.
### setFreezePeriod (0x28055d74)

```solidity
function setFreezePeriod(
    address pool,
    uint256 freezePeriod_
) external onlyGovernance onlyKnownPool(pool)
```

Updates the freeze period of `pool`. Reverts if below `MINIMUM_FREEZE_PERIOD`.
### unfreezePool (0xc41548a3)

```solidity
function unfreezePool(address pool) external onlyGovernance onlyKnownPool(pool)
```

Lifts an active freeze on `pool` early, before it auto-expires.