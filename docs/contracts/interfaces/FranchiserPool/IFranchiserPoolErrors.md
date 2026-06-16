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

### MaxDelegateesExceeded

```solidity
error MaxDelegateesExceeded(uint256 provided, uint256 maxDelegatees)
```

Thrown when attempting to add a new delegatee beyond the maximum cap.


Parameters:

| Name          | Type    | Description                               |
| :------------ | :------ | :---------------------------------------- |
| provided      | uint256 | The number of delegatees being added.     |
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

### FreezePeriodTooLong

```solidity
error FreezePeriodTooLong(uint256 provided, uint256 maximum)
```

Thrown when a freeze period longer than the enforced maximum is provided.


Parameters:

| Name     | Type    | Description                        |
| :------- | :------ | :--------------------------------- |
| provided | uint256 | The provided freeze period.        |
| maximum  | uint256 | The maximum allowed freeze period. |

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
### MaxDelegateesExceedsLimit

```solidity
error MaxDelegateesExceedsLimit(uint256 provided, uint256 limit)
```

Thrown when `maxDelegatees_` exceeds the hard upper limit `MAX_DELEGATEES`.


Parameters:

| Name     | Type    | Description                                 |
| :------- | :------ | :------------------------------------------ |
| provided | uint256 | The provided maximum number of delegatees.  |
| limit    | uint256 | The hard upper limit.                       |

### CoordinatorGuardianCollision

```solidity
error CoordinatorGuardianCollision(address address_)
```

Thrown when the coordinator and guardian addresses are the same.


Parameters:

| Name     | Type    | Description              |
| :------- | :------ | :----------------------- |
| address_ | address | The conflicting address. |

### NotCoordinatorOrFactory

```solidity
error NotCoordinatorOrFactory(address caller, address coordinator, address factory)
```

Thrown when an address other than the coordinator or factory attempts to call a restricted function.


Parameters:

| Name        | Type    | Description                           |
| :---------- | :------ | :------------------------------------ |
| caller      | address | The address that attempted the call.  |
| coordinator | address | The coordinator address.              |
| factory     | address | The factory address.                  |

### AddressCollision

```solidity
error AddressCollision(address addr)
```

Thrown when attempting to transfer delegation to the same address.


Parameters:

| Name | Type    | Description                                                                     |
| :--- | :------ | :------------------------------------------------------------------------------ |
| addr | address | The address that is both the source and destination of the delegation transfer. |
