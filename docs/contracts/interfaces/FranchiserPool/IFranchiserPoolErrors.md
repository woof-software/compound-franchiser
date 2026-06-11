# IFranchiserPoolErrors

## Overview

#### License: GPL-3.0-or-later

```solidity
interface IFranchiserPoolErrors
```


## Errors info

### NotFactory

```solidity
error NotFactory(address caller, address factory)
```

Thrown when an address other than the factory attempts to call a factory-restricted function.


Parameters:

| Name    | Type    | Description                           |
| :------ | :------ | :------------------------------------ |
| caller  | address | The address that attempted the call.  |
| factory | address | The factory address.                  |

### NotCoordinator

```solidity
error NotCoordinator(address caller, address coordinator)
```

Thrown when an address other than the coordinator attempts to call a coordinator-restricted function.


Parameters:

| Name        | Type    | Description                           |
| :---------- | :------ | :------------------------------------ |
| caller      | address | The address that attempted the call.  |
| coordinator | address | The coordinator address.              |

### NotGuardian

```solidity
error NotGuardian(address caller, address guardian)
```

Thrown when an address other than the guardian attempts to call a guardian-restricted function.


Parameters:

| Name     | Type    | Description                           |
| :------- | :------ | :------------------------------------ |
| caller   | address | The address that attempted the call.  |
| guardian | address | The guardian address.                 |

### PoolFrozen

```solidity
error PoolFrozen(uint256 frozenUntil)
```

Thrown when a coordinator action is attempted while the pool is frozen.


Parameters:

| Name        | Type    | Description                                        |
| :---------- | :------ | :------------------------------------------------- |
| frozenUntil | uint256 | The timestamp until which the pool remains frozen. |

### MaxDelegateesReached

```solidity
error MaxDelegateesReached(uint256 maxDelegatees)
```

Thrown when attempting to add a new delegatee beyond the maximum cap.


Parameters:

| Name          | Type    | Description                               |
| :------------ | :------ | :---------------------------------------- |
| maxDelegatees | uint256 | The current maximum number of delegatees. |

### FreezePeriodTooShort

```solidity
error FreezePeriodTooShort(uint256 provided, uint256 minimum)
```

Thrown when a freeze period shorter than the enforced minimum is provided.


Parameters:

| Name     | Type    | Description                        |
| :------- | :------ | :--------------------------------- |
| provided | uint256 | The provided freeze period.        |
| minimum  | uint256 | The minimum allowed freeze period. |

### ZeroAddress

```solidity
error ZeroAddress()
```

Thrown when a required address argument is the zero address.
### ZeroAmount

```solidity
error ZeroAmount()
```

Thrown when a required amount argument is zero.