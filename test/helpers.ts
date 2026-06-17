import { network } from "hardhat";
import type { ContractTransactionReceipt } from "ethers";
import type { FranchiserPoolFactory } from "../types/ethers-contracts/FranchiserPoolFactory.js";
import type { MockVotingToken } from "../types/ethers-contracts/mocks/MockVotingToken.js";

export const GOVERNANCE_ADDRESS = "0x6d903f6003cca6255D85CcA4D3B5E5146dC33925";
export const FREEZE_PERIOD = 10 * 24 * 3600; // 10 days in seconds
export const MAXIMUM_FREEZE_PERIOD = 30 * 24 * 3600; // 30 days in seconds

// COMP is hardcoded as `votingToken` in FranchiserPoolFactory, so tests run
// against a mainnet fork and interact with the real deployed token.
export const COMP_ADDRESS = "0xc00e94Cb662C3520282E6f5717214004A7f26888";
const COMP_BALANCE_SLOT = 1n; // slot of `balances` in Compound's Comp.sol
export const COMP_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)",
    "function transferFrom(address,address,uint256) returns (bool)",
    "function approve(address,uint256) returns (bool)",
    "function delegate(address)",
    "function getCurrentVotes(address) view returns (uint96)",
];

export async function createMainnetConnection() {
    return network.create("hardhatMainnet");
}

export type MainnetConnection = Awaited<ReturnType<typeof createMainnetConnection>>;

/**
 * Forges a COMP balance for `account` by writing directly into the token's storage.
 * Must be called with the same connection the caller's fork lives on — each
 * `createMainnetConnection()` call spins up an independent chain instance.
 */
export async function forgeCompBalance(connection: MainnetConnection, account: string, amount: bigint) {
    const { ethers } = connection;
    const slot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [account, COMP_BALANCE_SLOT])
    );
    await connection.provider.request({
        method: "hardhat_setStorageAt",
        params: [
            COMP_ADDRESS,
            slot,
            ethers.zeroPadValue(ethers.toBeHex(amount), 32),
        ],
    });
}

/**
 * Deploys the Franchiser implementation + FranchiserPoolFactory against the real
 * COMP token on a forked mainnet connection, then forges and approves a COMP
 * balance for `governance` so fixtures can call createPool / createPoolAndFund freely.
 */
export async function deployFranchiserPoolFactory(connection: MainnetConnection, governanceFunding: bigint) {
    const { ethers, networkHelpers } = connection;

    await networkHelpers.setBalance(GOVERNANCE_ADDRESS, ethers.parseEther("100"));
    const governance = await ethers.getImpersonatedSigner(GOVERNANCE_ADDRESS);

    const token = new ethers.Contract(COMP_ADDRESS, COMP_ABI, ethers.provider) as unknown as MockVotingToken;
    const franchiserImplementation = await ethers.deployContract("Franchiser", [
        await token.getAddress(),
    ]);
    const poolFactory = await ethers.deployContract("FranchiserPoolFactory", [
        await franchiserImplementation.getAddress(),
    ]);

    await forgeCompBalance(connection, governance.address, governanceFunding);
    await token.connect(governance).approve(await poolFactory.getAddress(), ethers.MaxUint256);

    return { governance, token, franchiserImplementation, poolFactory };
}

function findPoolCreatedLog(factory: FranchiserPoolFactory, receipt: ContractTransactionReceipt | null) {
    return receipt?.logs.find(
        (log) => log.topics[0] === factory.interface.getEvent("PoolCreated").topicHash
    );
}

/** Extracts the pool address from a createPool/createPoolAndFund receipt's PoolCreated event. */
export function getCreatedPoolAddress(
    factory: FranchiserPoolFactory,
    receipt: ContractTransactionReceipt | null
): string {
    const log = findPoolCreatedLog(factory, receipt);
    return log ? (factory.interface.parseLog(log)?.args[0] as string) : "";
}

/** Parses a createPool/createPoolAndFund receipt's PoolCreated event, exposing all its args. */
export function parseCreatedPoolLog(factory: FranchiserPoolFactory, receipt: ContractTransactionReceipt | null) {
    const log = findPoolCreatedLog(factory, receipt);
    return log ? factory.interface.parseLog(log) : null;
}
