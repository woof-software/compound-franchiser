# FranchiserPool

## Overview

#### License: GPL-3.0-or-later

```solidity
contract FranchiserPool is IFranchiserPool, FranchiserImmutableState
```

Manages a pool of idle COMP and distributes it to top-level delegatees via
Franchiser instances. Deployed and controlled by FranchiserPoolFactory on
behalf of Governance. The Coordinator manages delegations; the Guardian
provides emergency recall and freeze capabilities.
## Constants info

### INITIAL_MAXIMUM_SUBDELEGATEES (0xe95c4d36)

```solidity
uint96 constant INITIAL_MAXIMUM_SUBDELEGATEES = 1
```


### MINIMUM_FREEZE_PERIOD (0x82d73663)

```solidity
uint256 constant MINIMUM_FREEZE_PERIOD = 10 days
```


## State variables info

### franchiserImplementation (0xc61bdcd2)

```solidity
contract Franchiser immutable franchiserImplementation
```


### factory (0xc45a0155)

```solidity
address immutable factory
```


### coordinator (0x0a009097)

```solidity
address coordinator
```


### guardian (0x452a9320)

```solidity
address guardian
```


### maxDelegatees (0xb7f5dc55)

```solidity
uint256 maxDelegatees
```


### freezePeriod (0x0a3cb663)

```solidity
uint256 freezePeriod
```


### frozenUntil (0x6b47ffd7)

```solidity
uint256 frozenUntil
```


## Modifiers info

### onlyFactory

```solidity
modifier onlyFactory()
```


### onlyCoordinator

```solidity
modifier onlyCoordinator()
```


### onlyGuardian

```solidity
modifier onlyGuardian()
```


### whenNotFrozen

```solidity
modifier whenNotFrozen()
```


## Functions info

### constructor

```solidity
constructor(
    IVotingToken votingToken_,
    address coordinator_,
    address guardian_,
    uint256 maxDelegatees_,
    uint256 freezePeriod_
) FranchiserImmutableState(votingToken_)
```


### activeDelegatees (0xcc8bb7d4)

```solidity
function activeDelegatees() external view returns (address[] memory)
```

Returns the current set of active top-level delegatee addresses.
### getFranchiser (0x78b440ac)

```solidity
function getFranchiser(address delegatee) public view returns (Franchiser)
```

Returns the deterministic Franchiser address for a given delegatee.

The contract may or may not be deployed yet.
### delegate (0x026e402b)

```solidity
function delegate(
    address delegatee,
    uint256 amount
) external onlyCoordinator whenNotFrozen
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
### emergencyRecallDelegatees (0xf9cfd787)

```solidity
function emergencyRecallDelegatees(
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

Reverts if `freezePeriod_` is below `MINIMUM_FREEZE_PERIOD`.
### unfreeze (0x6a28f000)

```solidity
function unfreeze() external onlyFactory
```

Lifts an active freeze early, re-enabling coordinator actions.