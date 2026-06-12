# IFranchiserPool

## Overview

#### License: GPL-3.0-or-later

```solidity
interface IFranchiserPool is IFranchiserPoolErrors, IFranchiserPoolEvents, IFranchiserImmutableState
```


## Functions info

### INITIAL_MAXIMUM_SUBDELEGATEES (0xe95c4d36)

```solidity
function INITIAL_MAXIMUM_SUBDELEGATEES() external view returns (uint96)
```

The maximum number of sub-delegatees a pool-owned Franchiser can have.
### MINIMUM_FREEZE_PERIOD (0x82d73663)

```solidity
function MINIMUM_FREEZE_PERIOD() external view returns (uint256)
```

The minimum duration for an emergency freeze.
### MAXIMUM_FREEZE_PERIOD (0xa27bee2c)

```solidity
function MAXIMUM_FREEZE_PERIOD() external view returns (uint256)
```

The maximum duration for an emergency freeze.
### franchiserImplementation (0xc61bdcd2)

```solidity
function franchiserImplementation() external view returns (Franchiser)
```

The Franchiser implementation used to clone top-level Franchiser contracts.
### factory (0xc45a0155)

```solidity
function factory() external view returns (address)
```

The FranchiserPoolFactory that deployed and controls this pool.
### coordinator (0x0a009097)

```solidity
function coordinator() external view returns (address)
```

The coordinator address authorized to delegate, recall, and reassign.
### guardian (0x452a9320)

```solidity
function guardian() external view returns (address)
```

The guardian address authorized to emergency-recall and freeze.
### maxDelegatees (0xb7f5dc55)

```solidity
function maxDelegatees() external view returns (uint256)
```

The maximum number of simultaneous top-level delegatees.
### freezePeriod (0x0a3cb663)

```solidity
function freezePeriod() external view returns (uint256)
```

The duration applied to future emergency freezes.
### frozenUntil (0x6b47ffd7)

```solidity
function frozenUntil() external view returns (uint256)
```

The timestamp until which coordinator actions are blocked (0 = not frozen).
### activeDelegatees (0xcc8bb7d4)

```solidity
function activeDelegatees() external view returns (address[] memory)
```

Returns the current set of active top-level delegatee addresses.
### getFranchiser (0x78b440ac)

```solidity
function getFranchiser(address delegatee) external view returns (Franchiser)
```

Returns the deterministic Franchiser address for a given delegatee.

The contract may or may not be deployed yet.
### delegate (0x026e402b)

```solidity
function delegate(address delegatee, uint256 amount) external
```

Delegates `amount` of COMP from the pool to `delegatee`.

Clones and initializes a Franchiser on first use. Reverts if the
delegatee cap is reached when adding a new delegatee.
### recall (0xca430519)

```solidity
function recall(address delegatee) external
```

Fully recalls one delegatee's COMP (including sub-delegatee subtree) back to the pool.
### reassign (0x52944123)

```solidity
function reassign(address from, address to, uint256 amount) external
```

Recalls all COMP from `from` and delegates `amount` to `to` atomically.
### emergencyFreezeAndRecallPool (0x622957a1)

```solidity
function emergencyFreezeAndRecallPool() external
```

Recalls all delegatees and freezes coordinator actions for `freezePeriod` seconds.
### emergencyRecallDelegatees (0xf9cfd787)

```solidity
function emergencyRecallDelegatees(address[] calldata delegatees) external
```

Recalls COMP from the specified delegatees back to the pool.
### emergencyFreezePool (0x65a964ad)

```solidity
function emergencyFreezePool() external
```

Freezes coordinator actions for `freezePeriod` seconds without recalling delegatees.
### halt (0x364db0fc)

```solidity
function halt(address recipient) external
```

Recalls all delegatees and transfers the entire COMP balance to `recipient`.
### setCoordinator (0x8ea98117)

```solidity
function setCoordinator(address coordinator_) external
```

Replaces the coordinator address immediately.
### setGuardian (0x8a0dac4a)

```solidity
function setGuardian(address guardian_) external
```

Replaces the guardian address immediately.
### setMaxDelegatees (0xfedf632e)

```solidity
function setMaxDelegatees(uint256 maxDelegatees_) external
```

Updates the maximum delegatee cap. Lowering does not recall anyone.
### setFreezePeriod (0x57120165)

```solidity
function setFreezePeriod(uint256 freezePeriod_) external
```

Updates the freeze period applied to future emergency freezes.

Reverts if `freezePeriod_` is below `MINIMUM_FREEZE_PERIOD`.
### unfreeze (0x6a28f000)

```solidity
function unfreeze() external
```

Lifts an active freeze early, re-enabling coordinator actions.