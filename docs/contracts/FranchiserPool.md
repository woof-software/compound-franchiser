# FranchiserPool

## Overview

#### License: GPL-3.0-or-later

```solidity
contract FranchiserPool is IFranchiserPoolErrors, IFranchiserPoolEvents
```

Author: Woof

Manages a pool of idle COMP and distributes it to top-level delegatees via
Franchiser instances. Deployed and controlled by FranchiserPoolFactory on
behalf of Governance. The Coordinator manages delegations; the Guardian
provides emergency recall and freeze capabilities.
security-contact: dmitriy@woof.software

## Constants info

### INITIAL_MAXIMUM_SUBDELEGATEES (0xe95c4d36)

```solidity
uint96 constant INITIAL_MAXIMUM_SUBDELEGATEES = 1
```

The maximum number of sub-delegatees a pool-owned Franchiser can have.
### DELEGATEES_LIMIT (0xa66dc3d2)

```solidity
uint256 constant DELEGATEES_LIMIT = 100
```

Hard upper limit on `maxDelegatees` to ensure _recallAll always fits in one block.

Benchmarked worst-case (100 delegatees each with 1 active sub-delegatee): 11.15 M gas,
which is 66% of the 16.7 M block gas cap observed on mainnet. The break-even is ~150.
### MINIMUM_FREEZE_PERIOD (0x82d73663)

```solidity
uint256 constant MINIMUM_FREEZE_PERIOD = 10 days
```

The minimum duration for an emergency freeze.
### MAXIMUM_FREEZE_PERIOD (0xa27bee2c)

```solidity
uint256 constant MAXIMUM_FREEZE_PERIOD = 30 days
```

The maximum duration for an emergency freeze.
## State variables info

### franchiserImplementation (0xc61bdcd2)

```solidity
contract Franchiser immutable franchiserImplementation
```

The Franchiser implementation used to clone top-level Franchiser contracts.
### votingToken (0xb0340123)

```solidity
contract IERC20 immutable votingToken
```

The `votingToken` of the contract.

Should be the COMP token. Used for delegation and transfer of voting power.


Return values:

| Name | Type | Description |
| :--- | :--- | :---------- |


### factory (0xc45a0155)

```solidity
address immutable factory
```

The FranchiserPoolFactory that deployed and controls this pool.
### coordinator (0x0a009097)

```solidity
address coordinator
```

The coordinator address authorized to delegate, recall, and reassign.
### guardian (0x452a9320)

```solidity
address guardian
```

The guardian address authorized to emergency-recall and freeze.
### maxDelegatees (0xb7f5dc55)

```solidity
uint256 maxDelegatees
```

The maximum number of simultaneous top-level delegatees.
### freezePeriod (0x0a3cb663)

```solidity
uint256 freezePeriod
```

The duration applied to future emergency freezes.
### frozenUntil (0x6b47ffd7)

```solidity
uint256 frozenUntil
```

The timestamp until which coordinator actions are blocked.
## Modifiers info

### onlyFactory

```solidity
modifier onlyFactory()
```

Checks that the caller is the factory that deployed this pool.

Reverts with NotFactory if the caller is not the factory.
### onlyCoordinator

```solidity
modifier onlyCoordinator()
```

Checks that the caller is the coordinator.

Reverts with NotCoordinator if the caller is not the coordinator.
### onlyGuardian

```solidity
modifier onlyGuardian()
```

Checks that the caller is the guardian.

Reverts with NotGuardian if the caller is not the guardian.
### whenNotFrozen

```solidity
modifier whenNotFrozen()
```

Checks that the pool is not currently frozen.

Reverts with PoolFrozen if the current timestamp is less than `frozenUntil`.
## Functions info

### constructor

```solidity
constructor(
    IERC20 votingToken_,
    address coordinator_,
    address guardian_,
    uint256 maxDelegatees_,
    uint256 freezePeriod_,
    Franchiser franchiserImplementation_
)
```

The constructor sets the `votingToken`, `coordinator`, `guardian`, `maxDelegatees`, and `freezePeriod`.


Parameters:

| Name           | Type            | Description                                                       |
| :------------- | :-------------- | :---------------------------------------------------------------- |
| votingToken_   | contract IERC20 | The `votingToken` of the contract.                                |
| coordinator_   | address         | The initial coordinator address.                                  |
| guardian_      | address         | The initial guardian address.                                     |
| maxDelegatees_ | uint256         | The maximum number of simultaneous top-level delegatees.          |
| freezePeriod_  | uint256         | The initial emergency freeze duration (>= MINIMUM_FREEZE_PERIOD). |

### activeDelegatees (0xcc8bb7d4)

```solidity
function activeDelegatees() external view returns (address[] memory)
```

Returns the current set of active top-level delegatee addresses.
### delegate (0x026e402b)

```solidity
function delegate(address delegatee, uint256 amount) external whenNotFrozen
```

Delegates `amount` of COMP from the pool to `delegatee`.

Clones and initializes a Franchiser on first use. Reverts if the
delegatee cap is reached when adding a new delegatee.
### recall (0xca430519)

```solidity
function recall(address delegatee) external onlyCoordinator whenNotFrozen
```

Fully recalls one delegatee's COMP (including sub-delegatee subtree) back to the pool.
### reassign (0x52944123)

```solidity
function reassign(
    address from,
    address to,
    uint256 amount
) external onlyCoordinator whenNotFrozen
```

Recalls all COMP from `from` and delegates `amount` to `to` atomically.
### emergencyRecallDelegates (0x551ed8dd)

```solidity
function emergencyRecallDelegates(
    address[] calldata delegatees
) external onlyGuardian
```

Recalls COMP from the specified delegatees back to the pool.
### emergencyFreezeAndRecallPool (0x622957a1)

```solidity
function emergencyFreezeAndRecallPool() external onlyGuardian
```

Recalls all delegatees and freezes coordinator actions for `freezePeriod` seconds.
### emergencyFreezePool (0x65a964ad)

```solidity
function emergencyFreezePool() external onlyGuardian
```

Freezes coordinator actions for `freezePeriod` seconds without recalling delegatees.
### halt (0x364db0fc)

```solidity
function halt(address recipient) external onlyFactory
```

Recalls all delegatees and transfers the entire COMP balance to `recipient`.
### setCoordinator (0x8ea98117)

```solidity
function setCoordinator(address coordinator_) external onlyFactory
```

Replaces the coordinator address immediately.
### setGuardian (0x8a0dac4a)

```solidity
function setGuardian(address guardian_) external onlyFactory
```

Replaces the guardian address immediately.
### setMaxDelegatees (0xfedf632e)

```solidity
function setMaxDelegatees(uint256 maxDelegatees_) external onlyFactory
```

Updates the maximum delegatee cap. Lowering does not recall anyone.
### setFreezePeriod (0x57120165)

```solidity
function setFreezePeriod(uint256 freezePeriod_) external onlyFactory
```

Updates the freeze period applied to future emergency freezes.

Reverts if `freezePeriod_` is below `MINIMUM_FREEZE_PERIOD` or above `MAXIMUM_FREEZE_PERIOD`.
### unfreeze (0x6a28f000)

```solidity
function unfreeze() external onlyFactory
```

Lifts an active freeze early, re-enabling coordinator actions.
### getFranchiser (0x78b440ac)

```solidity
function getFranchiser(address delegatee) public view returns (Franchiser)
```

Returns the deterministic Franchiser address for a given delegatee.

The contract may or may not be deployed yet.