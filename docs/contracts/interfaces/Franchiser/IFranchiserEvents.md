# IFranchiserEvents

## Overview

#### License: GPL-3.0-or-later

```solidity
interface IFranchiserEvents
```


## Events info

### Initialized

```solidity
event Initialized(address indexed owner, address indexed delegator, address indexed delegatee, uint96 maximumSubDelegatees)
```

Emitted once per Franchiser.


Parameters:

| Name                 | Type    | Description                 |
| :------------------- | :------ | :-------------------------- |
| owner                | address | The `owner`.                |
| delegator            | address | The `delegator`.            |
| delegatee            | address | The `delegatee`.            |
| maximumSubDelegatees | uint96  | The `maximumSubDelegatees`. |

### SubDelegateeActivated

```solidity
event SubDelegateeActivated(address indexed subDelegatee)
```

Emitted when a `subDelegatee` is activated.


Parameters:

| Name         | Type    | Description         |
| :----------- | :------ | :------------------ |
| subDelegatee | address | The `subDelegatee`. |

### SubDelegateeDeactivated

```solidity
event SubDelegateeDeactivated(address indexed subDelegatee)
```

Emitted when a `subDelegatee` is deactivated.


Parameters:

| Name         | Type    | Description         |
| :----------- | :------ | :------------------ |
| subDelegatee | address | The `subDelegatee`. |
