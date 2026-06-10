# IFranchiserPoolEvents

## Overview

#### License: GPL-3.0-or-later

```solidity
interface IFranchiserPoolEvents
```


## Events info

### CoordinatorSet

```solidity
event CoordinatorSet(address indexed oldCoordinator, address indexed newCoordinator)
```

Emitted when the coordinator address is changed.
### GuardianSet

```solidity
event GuardianSet(address indexed oldGuardian, address indexed newGuardian)
```

Emitted when the guardian address is changed.
### MaxDelegateesSet

```solidity
event MaxDelegateesSet(uint256 oldMax, uint256 newMax)
```

Emitted when the maximum number of delegatees is changed.
### FreezePeriodSet

```solidity
event FreezePeriodSet(uint256 oldPeriod, uint256 newPeriod)
```

Emitted when the freeze period is changed.
### DelegateeActivated

```solidity
event DelegateeActivated(address indexed delegatee)
```

Emitted when a new top-level delegatee is added to the active set.
### DelegateeDeactivated

```solidity
event DelegateeDeactivated(address indexed delegatee)
```

Emitted when a top-level delegatee is removed from the active set.
### Delegated

```solidity
event Delegated(address indexed delegatee, uint256 amount)
```

Emitted when COMP is delegated to a franchiser.
### EmergencyFreeze

```solidity
event EmergencyFreeze(uint256 frozenUntil)
```

Emitted when the pool is emergency-frozen by the guardian.


Parameters:

| Name        | Type    | Description                                   |
| :---------- | :------ | :-------------------------------------------- |
| frozenUntil | uint256 | The timestamp until which the pool is frozen. |

### PoolUnfrozen

```solidity
event PoolUnfrozen()
```

Emitted when the pool freeze is lifted (by governance or auto-expiry passage).
### Halted

```solidity
event Halted(address indexed recipient)
```

Emitted when the pool is halted and all COMP is sent to a recipient.