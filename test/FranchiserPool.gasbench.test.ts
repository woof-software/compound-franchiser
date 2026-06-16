/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/**
 * Gas benchmark for FranchiserPool loop functions.
 *
 * Measures gas for _recallAll (via emergencyFreezeAndRecallPool) and
 * emergencyRecallDelegatees at varying delegatee counts to establish a safe
 * MAX_DELEGATEES constant.
 *
 * Deploys FranchiserPool directly so the deployer acts as factory, avoiding
 * the need to impersonate the hardcoded governance address in FranchiserPoolFactory.
 *
 * Run with:  npx hardhat test test/FranchiserPool.gasbench.test.ts
 */
import { expect } from "chai";
import { network } from "hardhat";
import { ethers as ethersType } from "ethers";

const { ethers, networkHelpers } = await network.create();

const FREEZE_PERIOD = 10 * 24 * 3600;
// Block gas cap observed from the forked mainnet block (2^24 - 1).
const BLOCK_GAS_LIMIT = 16_777_215n;

async function deployPool(delegateeCount: number, maxCap?: number) {
    // Signer[0] deploys, becoming the factory. Signer[1] = coordinator, Signer[2] = guardian.
    const [, coordinator, guardian] = await ethers.getSigners();

    const token = await ethers.deployContract("MockVotingToken");
    const pool = await ethers.deployContract("FranchiserPool", [
        await token.getAddress(),
        coordinator.address,
        guardian.address,
        BigInt(maxCap ?? delegateeCount),
        FREEZE_PERIOD,
    ]);

    const totalAmount = ethers.parseEther("100") * BigInt(maxCap ?? delegateeCount);
    await token.mint(await pool.getAddress(), totalAmount);

    return { pool, coordinator, guardian, token };
}

/** Deterministic addresses that require no private key — only used as delegation targets. */
function makeAddresses(count: number): string[] {
    return Array.from({ length: count }, (_, i) =>
        new ethers.Wallet(ethers.id(`bench-delegatee-${i}`)).address
    );
}

async function benchRecallAll(count: number): Promise<bigint> {
    const { pool, coordinator, guardian } = await deployPool(count);
    const amountEach = ethers.parseEther("100");

    for (const addr of makeAddresses(count)) {
        await pool.connect(coordinator).delegate(addr, amountEach);
    }

    const tx = await pool.connect(guardian).emergencyFreezeAndRecallPool({ gasLimit: BLOCK_GAS_LIMIT });
    const receipt = await tx.wait();
    expect(await pool.activeDelegatees()).to.be.empty;
    return receipt!.gasUsed;
}

async function benchEmergencyRecallDelegates(count: number): Promise<bigint> {
    // maxCap must be > count so that delegatees.length < maxDelegatees passes.
    const { pool, coordinator, guardian } = await deployPool(count, count + 1);
    const delegatees = makeAddresses(count);
    const amountEach = ethers.parseEther("100");

    for (const addr of delegatees) {
        await pool.connect(coordinator).delegate(addr, amountEach);
    }

    const tx = await pool.connect(guardian).emergencyRecallDelegates(delegatees, { gasLimit: BLOCK_GAS_LIMIT });
    const receipt = await tx.wait();
    expect(await pool.activeDelegatees()).to.be.empty;

    return receipt!.gasUsed;
}

/** Worst-case: every top-level delegatee has also filled its one sub-delegatee slot. */
async function benchRecallAllWithSubDelegates(count: number): Promise<bigint> {
    const { pool, coordinator, guardian, token } = await deployPool(count);
    const delegatees = makeAddresses(count);
    const subDelegatees = makeAddresses(count).map((_, i) =>
        new ethers.Wallet(ethers.id(`bench-sub-${i}`)).address
    );
    const amountEach = ethers.parseEther("200"); // 100 to top-level, 100 to sub

    // Mint extra tokens for sub-delegation
    await token.mint(await pool.getAddress(), ethers.parseEther("100") * BigInt(count));

    for (let i = 0; i < count; i++) {
        const addr = delegatees[i];
        await pool.connect(coordinator).delegate(addr, amountEach);

        const franchiserAddr = await pool.getFranchiser(addr);
        const franchiser = await ethers.getContractAt("Franchiser", franchiserAddr);
        const delegateeWallet = new ethers.Wallet(ethers.id(`bench-delegatee-${i}`), ethers.provider as ethersType.Provider);

        // Fund the delegatee wallet with ETH so it can call subDelegate
        await networkHelpers.setBalance(delegateeWallet.address, ethers.parseEther("1"));
        await franchiser.connect(delegateeWallet).subDelegate(subDelegatees[i], ethers.parseEther("100"));
    }

    const tx = await pool.connect(guardian).emergencyFreezeAndRecallPool({ gasLimit: BLOCK_GAS_LIMIT });
    const receipt = await tx.wait();
    expect(await pool.activeDelegatees()).to.be.empty;
    return receipt!.gasUsed;
}

const COUNTS = [10, 25, 50, 100];
// emergencyRecallDelegates requires delegatees.length < maxDelegatees, and maxDelegatees
// cannot exceed DELEGATEES_LIMIT (100), so the maximum addressable count is 99.
const PARTIAL_COUNTS = [10, 25, 50, 99];

describe("FranchiserPool – gas benchmarks (no mainnet fork needed)", function () {
    describe("_recallAll via emergencyFreezeAndRecallPool", function () {
        for (const count of COUNTS) {
            it(`${count} delegatees`, async function () {
                const gas = await benchRecallAll(count);
                const perDelegatee = gas / BigInt(count);
                console.log(
                    `  recallAll(${String(count).padStart(3)}): ` +
                    `${gas.toLocaleString().padStart(12)} gas  ` +
                    `(~${perDelegatee.toLocaleString().padStart(8)} per delegatee)  ` +
                    `fits in block: ${gas <= BLOCK_GAS_LIMIT}`
                );
                expect(gas).to.be.lte(BLOCK_GAS_LIMIT);
            });
        }
    });

    describe("emergencyRecallDelegates", function () {
        for (const count of PARTIAL_COUNTS) {
            it(`${count} delegatees`, async function () {
                const gas = await benchEmergencyRecallDelegates(count);
                const perDelegatee = gas / BigInt(count);
                console.log(
                    `  emergencyRecallDelegates(${String(count).padStart(3)}): ` +
                    `${gas.toLocaleString().padStart(12)} gas  ` +
                    `(~${perDelegatee.toLocaleString().padStart(8)} per delegatee)  ` +
                    `fits in block: ${gas <= BLOCK_GAS_LIMIT}`
                );
                expect(gas).to.be.lte(BLOCK_GAS_LIMIT);
            });
        }
    });

    describe("_recallAll worst-case: each delegatee has 1 active sub-delegatee", function () {
        for (const count of COUNTS) {
            it(`${count} delegatees`, async function () {
                const gas = await benchRecallAllWithSubDelegates(count);
                const perDelegatee = gas / BigInt(count);
                console.log(
                    `  recallAllWithSubs(${String(count).padStart(3)}): ` +
                    `${gas.toLocaleString().padStart(12)} gas  ` +
                    `(~${perDelegatee.toLocaleString().padStart(8)} per delegatee)  ` +
                    `fits in block: ${gas <= BLOCK_GAS_LIMIT}`
                );
                expect(gas).to.be.lte(BLOCK_GAS_LIMIT);
            });
        }
    });
});
