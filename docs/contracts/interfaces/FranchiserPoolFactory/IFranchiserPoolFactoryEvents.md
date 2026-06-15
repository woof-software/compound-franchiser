# IFranchiserPoolFactoryEvents

## Overview

#### License: GPL-3.0-or-later

```solidity
interface IFranchiserPoolFactoryEvents
```


## Events info

### PoolCreated

```solidity
event PoolCreated(address indexed pool, address indexed coordinator, address indexed guardian, uint256 maxDelegatees, uint256 freezePeriod)
```

Emitted when a new FranchiserPool is created.
### PoolFunded

```solidity
event PoolFunded(address indexed pool, uint256 amount)
```

Emitted when additional COMP is transferred to a pool.
### PoolHalted

```solidity
event PoolHalted(address indexed pool, address indexed recipient)
```

Emitted when a pool is halted and COMP is sent to a recipient.
### CoordinatorUpdated

```solidity
event CoordinatorUpdated(address indexed pool, address indexed newCoordinator)
```

Emitted when the coordinator of a pool is replaced.
### GuardianUpdated

```solidity
event GuardianUpdated(address indexed pool, address indexed newGuardian)
```

Emitted when the guardian of a pool is replaced.
### MaxDelegateesUpdated

```solidity
event MaxDelegateesUpdated(address indexed pool, uint256 newMaxDelegatees)
```

Emitted when the maximum number of delegatees for a pool is updated.
### FreezePeriodUpdated

```solidity
event FreezePeriodUpdated(address indexed pool, uint256 newFreezePeriod)
```

Emitted when the freeze period for a pool is updated.
### PoolUnfrozen

```solidity
event PoolUnfrozen(address indexed pool)
```

Emitted when a pool is unfrozen.