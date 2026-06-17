# FranchiserPoolFactory

## Overview

#### License: GPL-3.0-or-later

```solidity
contract FranchiserPoolFactory is IFranchiserPoolFactoryErrors, IFranchiserPoolFactoryEvents
```

Author: Woof

Governance's sole entry point for creating, funding, and halting
FranchiserPool programs, and for adjusting their parameters.
All functions are restricted to the immutable governance address.
security-contact: dmitriy@woof.software

## Constants info

### governance (0x5aa6e675)

```solidity
address constant governance = 0x6d903f6003cca6255D85CcA4D3B5E5146dC33925
```

The governance address (Compound timelock).
## State variables info

### votingToken (0xb0340123)

```solidity
contract IERC20 immutable votingToken
```

The `votingToken` of the contract.

Should be the COMP token. Used for delegation and transfer of voting power.


Return values:

| Name | Type | Description |
| :--- | :--- | :---------- |


### franchiserImplementation (0xc61bdcd2)

```solidity
contract Franchiser immutable franchiserImplementation
```

The Franchiser implementation used to clone top-level Franchiser contracts.
## Modifiers info

### onlyGovernance

```solidity
modifier onlyGovernance()
```

Checks that the caller is the governance address.

Reverts with NotGovernance if the caller is not governance.
### onlyKnownPool

```solidity
modifier onlyKnownPool(address pool)
```

Checks that `pool` is a known pool deployed by this factory.

Reverts with UnknownPool if `pool` is not in the `_pools` set.
## Functions info

### constructor

```solidity
constructor(IERC20 votingToken_)
```

The constructor sets the `votingToken`.


Parameters:

| Name         | Type            | Description                        |
| :----------- | :-------------- | :--------------------------------- |
| votingToken_ | contract IERC20 | The `votingToken` of the contract. |

### createPool (0x85ac165a)

```solidity
function createPool(
    address coordinator_,
    address guardian_,
    uint256 maxDelegatees_,
    uint256 freezePeriod_,
    uint256 amount
) public onlyGovernance returns (FranchiserPool pool)
```

Deploys a new FranchiserPool and seeds it with COMP.

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

### createPoolAndFund (0x83821fc0)

```solidity
function createPoolAndFund(
    address coordinator_,
    address guardian_,
    uint256 maxDelegatees_,
    uint256 freezePeriod_,
    uint256 totalAmount,
    address[] calldata delegatees,
    uint256[] calldata amounts
) external returns (FranchiserPool pool)
```

Deploys a new FranchiserPool and funds initial delegatees in a single transaction.

Requires governance to have approved this contract for `amount`.


Parameters:

| Name           | Type      | Description                                                                 |
| :------------- | :-------- | :-------------------------------------------------------------------------- |
| coordinator_   | address   | The initial coordinator address.                                            |
| guardian_      | address   | The initial guardian address.                                               |
| maxDelegatees_ | uint256   | The maximum number of simultaneous top-level delegatees.                    |
| freezePeriod_  | uint256   | The initial emergency freeze duration.                                      |
| delegatees     | address[] | The initial delegatees to fund.                                             |
| totalAmount    | uint256   | The total initial COMP amount to transfer from governance to the pool.      |
| amounts        | uint256[] | The initial amounts of COMP to transfer from governance to each delegatee.  |


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

Updates the freeze period of `pool`.
### unfreezePool (0xc41548a3)

```solidity
function unfreezePool(address pool) external onlyGovernance onlyKnownPool(pool)
```

Lifts an active freeze on `pool` early, before it auto-expires.
### isKnownPool (0x0de9f502)

```solidity
function isKnownPool(address pool) external view returns (bool)
```

Returns true if `pool` was deployed by this factory.
### getAllPools (0xd88ff1f4)

```solidity
function getAllPools() external view returns (address[] memory)
```

Returns the list of all pools deployed by this factory.