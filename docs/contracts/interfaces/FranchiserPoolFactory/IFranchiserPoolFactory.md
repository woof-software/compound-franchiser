# IFranchiserPoolFactory

## Overview

#### License: GPL-3.0-or-later

```solidity
interface IFranchiserPoolFactory is IFranchiserPoolFactoryErrors, IFranchiserPoolFactoryEvents, IFranchiserImmutableState
```


## Functions info

### MINIMUM_FREEZE_PERIOD (0x82d73663)

```solidity
function MINIMUM_FREEZE_PERIOD() external view returns (uint256)
```

The minimum freeze period enforced when creating pools or updating their freeze period.
### governance (0x5aa6e675)

```solidity
function governance() external view returns (address)
```

The immutable governance address (Compound timelock).
### isKnownPool (0x0de9f502)

```solidity
function isKnownPool(address pool) external view returns (bool)
```

Returns true if `pool` was deployed by this factory.
### createPool (0x85ac165a)

```solidity
function createPool(
    address coordinator_,
    address guardian_,
    uint256 maxDelegatees_,
    uint256 freezePeriod_,
    uint256 amount
) external returns (FranchiserPool pool)
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
function fundPool(address pool, uint256 amount) external
```

Transfers additional COMP from governance to an existing pool.

Requires governance to have approved this contract for `amount`.
### transferToPool (0xd7efa129)

```solidity
function transferToPool(address pool, uint256 amount) external
```

Transfer `amount` of COMP from factory balance to `pool`.

Should be used if COMP was transferred to the factory outside of `fundPool`
### haltPool (0xc902112d)

```solidity
function haltPool(address pool, address recipient) external
```

Recalls all delegatees of `pool` and transfers all COMP to `recipient`.
### setCoordinator (0xe56e7cca)

```solidity
function setCoordinator(address pool, address coordinator_) external
```

Replaces the coordinator of `pool`.
### setGuardian (0x33c509d1)

```solidity
function setGuardian(address pool, address guardian_) external
```

Replaces the guardian of `pool`.
### setMaxDelegatees (0x05585686)

```solidity
function setMaxDelegatees(address pool, uint256 maxDelegatees_) external
```

Updates the maximum delegatee cap of `pool`.
### setFreezePeriod (0x28055d74)

```solidity
function setFreezePeriod(address pool, uint256 freezePeriod_) external
```

Updates the freeze period of `pool`. Reverts if below `MINIMUM_FREEZE_PERIOD`.
### unfreezePool (0xc41548a3)

```solidity
function unfreezePool(address pool) external
```

Lifts an active freeze on `pool` early, before it auto-expires.