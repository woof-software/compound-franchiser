import { expect } from "chai";
import {
    createMainnetConnection,
    deployFranchiserPoolFactory,
    getCreatedPoolAddress,
    FREEZE_PERIOD,
    MAXIMUM_FREEZE_PERIOD,
} from "./helpers.js";

const connection = await createMainnetConnection();
const { ethers, networkHelpers } = connection;
const { time } = networkHelpers;

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function deployFixture() {
    const [, coordinator, guardian, delegatee, other] = await ethers.getSigners();

    const AMOUNT = ethers.parseEther("10000");
    const { governance, token, franchiserImplementation, poolFactory } =
        await deployFranchiserPoolFactory(connection, AMOUNT * 100n);

    return { governance, coordinator, guardian, delegatee, other, token, poolFactory, franchiserImplementation, AMOUNT };
}

async function poolFixture() {
    const base = await deployFixture();

    const { governance, coordinator, guardian, poolFactory, AMOUNT } = base;

    const MAX_DELEGATEES = 5n;
    const tx = await poolFactory.connect(governance).createPool(
        coordinator.address,
        guardian.address,
        MAX_DELEGATEES,
        FREEZE_PERIOD,
        AMOUNT
    );
    const receipt = await tx.wait();
    const poolAddr = getCreatedPoolAddress(poolFactory, receipt);
    const pool = await ethers.getContractAt("FranchiserPool", poolAddr);

    return { ...base, pool, poolAddr, MAX_DELEGATEES };
}

async function delegatedFixture() {
    const base = await poolFixture();
    const { pool, coordinator, delegatee, AMOUNT } = base;

    const DELEGATE_AMOUNT = AMOUNT / 2n;
    await pool.connect(coordinator).delegate(delegatee.address, DELEGATE_AMOUNT);

    return { ...base, DELEGATE_AMOUNT };
}

const restore = async () => await networkHelpers.loadFixture(poolFixture);
const restoreDelegated = async () => await networkHelpers.loadFixture(delegatedFixture);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FranchiserPool", function () {
    describe("deployment", function () {
        it("reverts if freeze period is below minimum", async function () {
            const { governance, coordinator, guardian, poolFactory, pool } = await restore();

            await expect(
                poolFactory.connect(governance).createPool(
                    coordinator.address,
                    guardian.address,
                    5n,
                    FREEZE_PERIOD - 1, // too short
                    1n
                )
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooShort");
        });

        it("reverts if freeze period is above maximum", async function () {
            const { governance, coordinator, guardian, poolFactory, pool } = await restore();

            await expect(
                poolFactory.connect(governance).createPool(
                    coordinator.address,
                    guardian.address,
                    5n,
                    MAXIMUM_FREEZE_PERIOD + 1, // too long
                    1n
                )
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooLong");
        });

        it("stores factory, coordinator, guardian, maxDelegatees, freezePeriod", async function () {
            const {
                pool,
                poolFactory,
                coordinator,
                guardian,
                MAX_DELEGATEES
            } = await restore();

            expect(await pool.factory()).to.equal(await poolFactory.getAddress());
            expect(await pool.coordinator()).to.equal(coordinator.address);
            expect(await pool.guardian()).to.equal(guardian.address);
            expect(await pool.maxDelegatees()).to.equal(MAX_DELEGATEES);
            expect(await pool.freezePeriod()).to.equal(BigInt(FREEZE_PERIOD));
        });

        it("starts with an empty active delegatees list", async function () {
            const { pool } = await restore();

            expect(await pool.activeDelegatees()).to.be.empty;
        });

        it("starts unfrozen (frozenUntil = 0)", async function () {
            const { pool } = await restore();

            expect(await pool.frozenUntil()).to.equal(0n);
        });

        it("reverts if coordinator is zero address", async function () {
            const { pool, governance, guardian, poolFactory } = await restore();

            await expect(
                poolFactory.connect(governance).createPool(
                    ethers.ZeroAddress,
                    guardian.address,
                    5n,
                    FREEZE_PERIOD,
                    1n
                )
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });

        it("reverts if guardian is zero address", async function () {
            const { pool, governance, coordinator, poolFactory } = await restore();

            await expect(
                poolFactory.connect(governance).createPool(
                    coordinator.address,
                    ethers.ZeroAddress,
                    5n,
                    FREEZE_PERIOD,
                    1n
                )
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });

        it("reverts if coordinator equals guardian", async function () {
            const { pool, governance, coordinator, poolFactory, AMOUNT } = await restore();

            await expect(
                poolFactory.connect(governance).createPool(
                    coordinator.address,
                    coordinator.address,
                    5n,
                    FREEZE_PERIOD,
                    AMOUNT
                )
            ).to.be.revertedWithCustomError(pool, "CoordinatorGuardianCollision");
        });

        it("reverts if maxDelegatees is 0", async function () {
            const { pool, governance, coordinator, guardian, poolFactory } = await restore();

            await expect(
                poolFactory.connect(governance).createPool(
                    coordinator.address,
                    guardian.address,
                    0n,
                    FREEZE_PERIOD,
                    1n
                )
            ).to.be.revertedWithCustomError(pool, "ZeroAmount");
        });

        it("reverts with MaxDelegateesExceedsLimit when maxDelegatees_ exceeds DELEGATEES_LIMIT", async function () {
            const { pool, governance, coordinator, guardian, poolFactory } = await restore();
            const limit = await pool.DELEGATEES_LIMIT();

            await expect(
                poolFactory.connect(governance).createPool(
                    coordinator.address,
                    guardian.address,
                    limit + 1n,
                    FREEZE_PERIOD,
                    1n
                )
            )
                .to.be.revertedWithCustomError(pool, "MaxDelegateesExceedsLimit")
                .withArgs(limit + 1n, limit);
        });
    });

    describe("delegate", function () {
        it("reverts if caller is not the coordinator or factory", async function () {
            const { pool, other, delegatee } = await restore();

            await expect(
                pool.connect(other).delegate(delegatee.address, 100n)
            )
                .to.be.revertedWithCustomError(pool, "NotCoordinatorOrFactory")
                .withArgs(other.address, await pool.coordinator(), await pool.factory());
        });

        it("reverts if delegatee is zero address", async function () {
            const { pool, coordinator } = await restore();

            await expect(
                pool.connect(coordinator).delegate(ethers.ZeroAddress, 100n)
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });

        it("creates a franchiser clone and adds delegatee to active set", async function () {
            const { pool, coordinator, delegatee } = await restore();

            const franchiserAddr = await pool.getFranchiser(delegatee.address);
            expect((await ethers.provider.getCode(franchiserAddr)).length).to.equal(2);

            await pool
                .connect(coordinator)
                .delegate(delegatee.address, ethers.parseEther("100"));

            expect((await ethers.provider.getCode(franchiserAddr)).length).to.be.gt(2);
            expect(await pool.activeDelegatees()).to.include(delegatee.address);
        });

        it("transfers tokens from pool to franchiser", async function () {
            const { pool, coordinator, delegatee, token } = await restore();

            const franchiserAddr = await pool.getFranchiser(delegatee.address);
            const delegateAmount = ethers.parseEther("100");

            await expect(
                pool.connect(coordinator).delegate(delegatee.address, delegateAmount)
            ).to.changeTokenBalances(
                ethers,
                token,
                [pool, franchiserAddr],
                [-delegateAmount, delegateAmount]
            );
        });

        it("emits DelegateeActivated and Delegated events", async function () {
            const { pool, coordinator, delegatee } = await restore();

            const delegateAmount = ethers.parseEther("100");

            await expect(
                pool.connect(coordinator).delegate(delegatee.address, delegateAmount)
            )
                .to.emit(pool, "DelegateeActivated")
                .withArgs(delegatee.address)
                .and.to.emit(pool, "Delegated")
                .withArgs(delegatee.address, delegateAmount);
        });

        it("does not re-emit DelegateeActivated on subsequent delegation", async function () {
            const { pool, coordinator, delegatee } = await restore();

            await pool
                .connect(coordinator)
                .delegate(delegatee.address, ethers.parseEther("100"));

            await expect(
                pool
                    .connect(coordinator)
                    .delegate(delegatee.address, ethers.parseEther("50"))
            ).to.not.emit(pool, "DelegateeActivated");
        });

        it("reverts at the maxDelegatees cap when adding a new delegatee", async function () {
            const {
                pool,
                poolFactory,
                governance,
                coordinator,
                AMOUNT
            } = await restore();

            // Create a pool with max=1
            const tx = await poolFactory.connect(governance).createPool(
                coordinator.address,
                await pool.guardian(),
                1n,
                FREEZE_PERIOD,
                AMOUNT
            );

            const receipt = await tx.wait();
            const addr = getCreatedPoolAddress(poolFactory, receipt);

            const smallPool = await ethers.getContractAt("FranchiserPool", addr);

            const [, , , delegatee1, delegatee2] = await ethers.getSigners();

            await smallPool
                .connect(coordinator)
                .delegate(delegatee1.address, ethers.parseEther("100"));

            await expect(
                smallPool
                    .connect(coordinator)
                    .delegate(delegatee2.address, ethers.parseEther("100"))
            )
                .to.be.revertedWithCustomError(smallPool, "MaxDelegateesExceeded")
                .withArgs(1n, 1n);
        });

        it("reverts if amount is zero", async function () {
            const { pool, coordinator, delegatee } = await restore();

            await expect(
                pool.connect(coordinator).delegate(delegatee.address, 0n)
            ).to.be.revertedWithCustomError(pool, "ZeroAmount");
        });

        it("reverts when pool is frozen", async function () {
            const { pool, coordinator, guardian, delegatee } = await restore();

            await pool.connect(guardian).emergencyFreezePool();

            await expect(
                pool
                    .connect(coordinator)
                    .delegate(delegatee.address, ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(pool, "PoolFrozen");
        });
    });

    describe("recall", function () {
        it("reverts if caller is not the coordinator", async function () {
            const { pool, other, delegatee } = await restoreDelegated();

            await expect(pool.connect(other).recall(delegatee.address))
                .to.be.revertedWithCustomError(pool, "NotCoordinator")
                .withArgs(other.address, await pool.coordinator());
        });

        it("returns tokens and vote power from franchiser to pool", async function () {
            const {
                pool,
                coordinator,
                delegatee,
                token,
                DELEGATE_AMOUNT
            }  = await restoreDelegated();

            const franchiserAddr = await pool.getFranchiser(delegatee.address);

            const delegateeVotesBefore = await token.getCurrentVotes(delegatee.address);

            await expect(
                pool.connect(coordinator).recall(delegatee.address)
            ).to.changeTokenBalances(
                ethers,
                token,
                [franchiserAddr, pool],
                [-DELEGATE_AMOUNT, DELEGATE_AMOUNT]
            );

            expect(await token.getCurrentVotes(delegatee.address)).to.be.equal(delegateeVotesBefore - DELEGATE_AMOUNT);
        });

        it("removes delegatee from active set and emits DelegateeDeactivated", async function () {
            const { pool, coordinator, delegatee } = await restoreDelegated();

            await expect(pool.connect(coordinator).recall(delegatee.address))
                .to.emit(pool, "DelegateeDeactivated")
                .withArgs(delegatee.address);
            expect(await pool.activeDelegatees()).to.not.include(delegatee.address);
        });

        it("reverts when pool is frozen", async function () {
            const { pool, coordinator, guardian, delegatee } = await restoreDelegated();

            await pool.connect(guardian).emergencyFreezePool();

            await expect(
                pool.connect(coordinator).recall(delegatee.address)
            ).to.be.revertedWithCustomError(pool, "PoolFrozen");
        });

        it("recalling a non-active delegatee does not revert and emits no DelegateeDeactivated", async function () {
            const { pool, coordinator, other } = await restore();

            await expect(
                pool.connect(coordinator).recall(other.address)
            ).to.not.emit(pool, "DelegateeDeactivated");

            expect(await pool.activeDelegatees()).to.not.include(other.address);
        });

        it("re-delegating to a previously recalled delegatee reactivates them", async function () {
            const { pool, coordinator, delegatee, token } = await restoreDelegated();

            await pool.connect(coordinator).recall(delegatee.address);
            expect(await pool.activeDelegatees()).to.not.include(delegatee.address);

            const reAmount = ethers.parseEther("300");

            await expect(
                pool.connect(coordinator).delegate(delegatee.address, reAmount)
            )
                .to.emit(pool, "DelegateeActivated")
                .withArgs(delegatee.address);

            expect(await pool.activeDelegatees()).to.include(delegatee.address);

            const franchiserAddr = await pool.getFranchiser(delegatee.address);
            expect(await token.balanceOf(franchiserAddr)).to.equal(reAmount);
            expect(await token.getCurrentVotes(delegatee.address)).to.equal(reAmount);
        });
    });

    describe("reassign", function () {
        it("reverts if caller is not the coordinator", async function () {
            const { pool, other, delegatee } = await restoreDelegated();

            const [, , , , newDelegatee] = await ethers.getSigners();
            await expect(
                pool
                    .connect(other)
                    .reassign(delegatee.address, newDelegatee.address, 100n)
            )
                .to.be.revertedWithCustomError(pool, "NotCoordinator")
                .withArgs(other.address, await pool.coordinator());
        });

        it("reverts if from equals to", async function () {
            const { pool, coordinator, delegatee } = await restoreDelegated();

            await expect(
                pool.connect(coordinator).reassign(delegatee.address, delegatee.address, 100n)
            )
                .to.be.revertedWithCustomError(pool, "AddressCollision")
                .withArgs(delegatee.address);
        });

        it("reverts if from or to is zero address", async function () {
            const { pool, coordinator, delegatee } = await restoreDelegated();

            await expect(
                pool.connect(coordinator).reassign(ethers.ZeroAddress, delegatee.address, 100n)
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");

            await expect(
                pool.connect(coordinator).reassign(delegatee.address, ethers.ZeroAddress, 100n)
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });

        it("reverts if amount is zero", async function () {
            const { pool, coordinator, delegatee, other } = await restoreDelegated();

            await expect(
                pool.connect(coordinator).reassign(delegatee.address, other.address, 0n)
            ).to.be.revertedWithCustomError(pool, "ZeroAmount");
        });

        it("recalls from old delegatee and delegates to new one", async function () {
            const { pool, coordinator, delegatee, token } = await restoreDelegated();

            const [, , , , newDelegatee] = await ethers.getSigners();

            const newAmount = ethers.parseEther("200");
            const oldFranchiserAddr = await pool.getFranchiser(delegatee.address);
            const newFranchiserAddr = await pool.getFranchiser(newDelegatee.address);

            await pool
                .connect(coordinator)
                .reassign(delegatee.address, newDelegatee.address, newAmount);

            // reassign fully recalls the old franchiser before creating the new one
            expect(await token.getCurrentVotes(delegatee.address)).to.be.equal(0n);
            expect(await token.getCurrentVotes(newDelegatee.address)).to.be.equal(newAmount);

            expect(await token.balanceOf(oldFranchiserAddr)).to.equal(0n);
            expect(await token.balanceOf(newFranchiserAddr)).to.equal(newAmount);
        });

        it("reverts when pool is frozen", async function () {
            const { pool, coordinator, guardian, delegatee } = await restoreDelegated();

            const [, , , , newDelegatee] = await ethers.getSigners();
            await pool.connect(guardian).emergencyFreezePool();

            await expect(
                pool
                    .connect(coordinator)
                    .reassign(delegatee.address, newDelegatee.address, 100n)
            ).to.be.revertedWithCustomError(pool, "PoolFrozen");
        });

        it("adds tokens to already-active delegatee without re-emitting DelegateeActivated", async function () {
            const {
                pool,
                coordinator,
                delegatee,
                token,
                DELEGATE_AMOUNT
            } = await restoreDelegated();
            const [, , , , , secondDelegatee] = await ethers.getSigners();

            // Make secondDelegatee active too
            await pool.connect(coordinator).delegate(secondDelegatee.address, ethers.parseEther("200"));

            const franchiserAddr = await pool.getFranchiser(delegatee.address);
            const additionalAmount = ethers.parseEther("100");

            // Reassign from secondDelegatee to the already-active delegatee
            await expect(
                pool.connect(coordinator).reassign(secondDelegatee.address, delegatee.address, additionalAmount)
            ).to.not.emit(pool, "DelegateeActivated");

            expect(await token.balanceOf(franchiserAddr)).to.equal(DELEGATE_AMOUNT + additionalAmount);
            expect(await pool.activeDelegatees()).to.include(delegatee.address);
            expect(await pool.activeDelegatees()).to.not.include(secondDelegatee.address);
        });
    });

    describe("sub-delegation from pool franchisers", function () {
        it("delegatee can sub-delegate once (INITIAL_MAXIMUM_SUBDELEGATEES = 1)", async function () {
            const { pool, delegatee, token, DELEGATE_AMOUNT } = await restoreDelegated();
            const [, , , , , subDelegatee] = await ethers.getSigners();

            const franchiserAddr = await pool.getFranchiser(delegatee.address);
            const franchiser = await ethers.getContractAt("Franchiser", franchiserAddr);

            const subAmount = DELEGATE_AMOUNT / 2n;

            await expect(
                franchiser.connect(delegatee).subDelegate(subDelegatee.address, subAmount)
            )
                .to.emit(franchiser, "SubDelegateeActivated")
                .withArgs(subDelegatee.address);

            expect(await token.getCurrentVotes(subDelegatee.address)).to.equal(subAmount);

            const subFranchiserAddr = await franchiser.getFranchiser(subDelegatee.address);
            expect(await token.balanceOf(subFranchiserAddr)).to.equal(subAmount);
        });

        it("sub-delegatee cannot further sub-delegate (maximumSubDelegatees decays to 0)", async function () {
            const { pool, delegatee, DELEGATE_AMOUNT } = await restoreDelegated();
            const [, , , , , subDelegatee, deepDelegatee] = await ethers.getSigners();

            const franchiserAddr = await pool.getFranchiser(delegatee.address);
            const franchiser = await ethers.getContractAt("Franchiser", franchiserAddr);

            await franchiser.connect(delegatee).subDelegate(subDelegatee.address, DELEGATE_AMOUNT / 2n);

            const subFranchiserAddr = await franchiser.getFranchiser(subDelegatee.address);
            const subFranchiser = await ethers.getContractAt("Franchiser", subFranchiserAddr);

            await expect(
                subFranchiser.connect(subDelegatee).subDelegate(deepDelegatee.address, 100n)
            )
                .to.be.revertedWithCustomError(subFranchiser, "CannotExceedMaximumSubDelegatees")
                .withArgs(0n);
        });

        it("pool recall with active sub-delegatee returns all tokens to pool", async function () {
            const { pool, coordinator, delegatee, token, DELEGATE_AMOUNT } = await restoreDelegated();
            const [, , , , , subDelegatee] = await ethers.getSigners();

            const franchiserAddr = await pool.getFranchiser(delegatee.address);
            const franchiser = await ethers.getContractAt("Franchiser", franchiserAddr);
            const subAmount = DELEGATE_AMOUNT / 2n;
            await franchiser.connect(delegatee).subDelegate(subDelegatee.address, subAmount);

            const subFranchiserAddr = await franchiser.getFranchiser(subDelegatee.address);

            await pool.connect(coordinator).recall(delegatee.address);

            expect(await token.balanceOf(franchiserAddr)).to.equal(0n);
            expect(await token.balanceOf(subFranchiserAddr)).to.equal(0n);
            expect(await token.getCurrentVotes(delegatee.address)).to.equal(0n);
            expect(await token.getCurrentVotes(subDelegatee.address)).to.equal(0n);
        });

        it("haltPool with active sub-delegatees returns all tokens to recipient", async function () {
            const {
                pool,
                poolFactory,
                governance,
                delegatee,
                other,
                token,
                AMOUNT,
                DELEGATE_AMOUNT
            } = await restoreDelegated();

            const [, , , , , subDelegatee] = await ethers.getSigners();

            const franchiserAddr = await pool.getFranchiser(delegatee.address);
            const franchiser = await ethers.getContractAt("Franchiser", franchiserAddr);
            const subAmount = DELEGATE_AMOUNT / 4n;
            await franchiser.connect(delegatee).subDelegate(subDelegatee.address, subAmount);

            const subFranchiserAddr = await franchiser.getFranchiser(subDelegatee.address);

            await poolFactory.connect(governance).haltPool(await pool.getAddress(), other.address);

            expect(await token.balanceOf(franchiserAddr)).to.equal(0n);
            expect(await token.balanceOf(subFranchiserAddr)).to.equal(0n);
            expect(await token.balanceOf(await pool.getAddress())).to.equal(0n);
            expect(await token.balanceOf(other.address)).to.equal(AMOUNT);
        });
    });

    describe("emergencyRecallDelegates", function () {
        it("reverts if caller is not the guardian", async function () {
            const { pool, other, delegatee } = await restoreDelegated();

            await expect(
                pool.connect(other).emergencyRecallDelegates([delegatee.address])
            )
                .to.be.revertedWithCustomError(pool, "NotGuardian")
                .withArgs(other.address, await pool.guardian());
        });

        it("reverts if delegatees array is empty", async function () {
            const { pool, guardian } = await restoreDelegated();

            await expect(
                pool.connect(guardian).emergencyRecallDelegates([])
            ).to.be.revertedWithCustomError(pool, "ZeroAmount");
        });

        it("reverts if delegatees length > active delegatees", async function () {
            const { pool, coordinator, guardian, MAX_DELEGATEES } = await restoreDelegated();

            const addrs = Array.from({ length: Number(MAX_DELEGATEES) + 1 }, () =>
                ethers.Wallet.createRandom().address
            );

            for (let i = 0; i < MAX_DELEGATEES - 1n; ++i) {
                await pool.connect(coordinator).delegate(addrs[i], ethers.parseEther("1"));
            }

            await expect(
                pool.connect(guardian).emergencyRecallDelegates(addrs)
            )
                .to.be.revertedWithCustomError(pool, "ActiveDelegateesExceeded")
                .withArgs(addrs.length, MAX_DELEGATEES);
        });

        it("recalls tokens from specified delegatees back to pool", async function () {
            const {
                pool,
                guardian,
                delegatee,
                token,
                DELEGATE_AMOUNT
            } = await restoreDelegated();

            const franchiserAddr = await pool.getFranchiser(delegatee.address);

            await expect(
                pool
                    .connect(guardian)
                    .emergencyRecallDelegates([delegatee.address])
            ).to.changeTokenBalances(
                ethers,
                token,
                [franchiserAddr, pool],
                [-DELEGATE_AMOUNT, DELEGATE_AMOUNT]
            );
        });

        it("emits DelegateeDeactivated for each recalled active delegatee", async function () {
            const { pool, guardian, delegatee } = await restoreDelegated();

            await expect(
                pool.connect(guardian).emergencyRecallDelegates([delegatee.address])
            )
                .to.emit(pool, "DelegateeDeactivated")
                .withArgs(delegatee.address);
        });

        it("does not emit DelegateeDeactivated for non-active addresses", async function () {
            const { pool, guardian, other } = await restoreDelegated();

            await expect(
                pool.connect(guardian).emergencyRecallDelegates([other.address])
            ).to.not.emit(pool, "DelegateeDeactivated");
        });

        it("works even when pool is frozen", async function () {
            const { pool, guardian, delegatee } = await restoreDelegated();

            await pool.connect(guardian).emergencyFreezePool();

            // Guardian can still recall even while frozen
            await pool
                .connect(guardian)
                .emergencyRecallDelegates([delegatee.address]);

            expect(await pool.activeDelegatees()).to.not.include(delegatee.address);
        });
    });

    describe("emergencyFreezeAndRecallPool", function () {
        it("reverts if caller is not the guardian", async function () {
            const { pool, other } = await restore();

            await expect(pool.connect(other).emergencyFreezeAndRecallPool())
                .to.be.revertedWithCustomError(pool, "NotGuardian")
                .withArgs(other.address, await pool.guardian());
        });

        it("recalls all delegatees and sets frozenUntil", async function () {
            const { pool, coordinator, guardian, delegatee, token, AMOUNT } = await restore();
            const [, , , , , delegatee2, delegatee3] = await ethers.getSigners();

            const amount1 = AMOUNT / 4n;
            const amount2 = AMOUNT / 6n;
            const amount3 = AMOUNT / 8n;

            await pool.connect(coordinator).delegate(delegatee.address, amount1);
            await pool.connect(coordinator).delegate(delegatee2.address, amount2);
            await pool.connect(coordinator).delegate(delegatee3.address, amount3);

            const franchiser1 = await pool.getFranchiser(delegatee.address);
            const franchiser2 = await pool.getFranchiser(delegatee2.address);
            const franchiser3 = await pool.getFranchiser(delegatee3.address);

            expect(await token.getCurrentVotes(delegatee.address)).to.equal(amount1);
            expect(await token.getCurrentVotes(delegatee2.address)).to.equal(amount2);
            expect(await token.getCurrentVotes(delegatee3.address)).to.equal(amount3);

            const latestBlock = await time.latest();
            await pool.connect(guardian).emergencyFreezeAndRecallPool();

            expect(await token.balanceOf(franchiser1)).to.equal(0n);
            expect(await token.balanceOf(franchiser2)).to.equal(0n);
            expect(await token.balanceOf(franchiser3)).to.equal(0n);

            expect(await token.getCurrentVotes(delegatee.address)).to.equal(0n);
            expect(await token.getCurrentVotes(delegatee2.address)).to.equal(0n);
            expect(await token.getCurrentVotes(delegatee3.address)).to.equal(0n);

            expect(await pool.activeDelegatees()).to.be.empty;
            const frozenUntil = await pool.frozenUntil();
            expect(frozenUntil).to.be.gte(BigInt(latestBlock) + BigInt(FREEZE_PERIOD));
        });

        it("emits EmergencyFreeze event with correct frozenUntil", async function () {
            const { pool, guardian } = await restore();

            const latestTime = BigInt(await time.latest());

            await expect(
                pool.connect(guardian).emergencyFreezeAndRecallPool()
            )
                .to.emit(pool, "EmergencyFreeze")
                .withArgs((until: bigint) => until >= latestTime + BigInt(FREEZE_PERIOD));
        });

        it("blocks coordinator actions while frozen", async function () {
            const { pool, guardian, coordinator, delegatee } = await restore();

            await pool.connect(guardian).emergencyFreezeAndRecallPool();

            await expect(
                pool
                    .connect(coordinator)
                    .delegate(delegatee.address, ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(pool, "PoolFrozen");
        });
    });

    describe("emergencyFreezePool", function () {
        it("reverts if caller is not the guardian", async function () {
            const { pool, other } = await restore();

            await expect(pool.connect(other).emergencyFreezePool())
                .to.be.revertedWithCustomError(pool, "NotGuardian")
                .withArgs(other.address, await pool.guardian());
        });

        it("sets frozenUntil without recalling delegatees", async function () {
            const { pool, guardian, delegatee } = await restoreDelegated();

            const latestBlock = await time.latest();
            await pool.connect(guardian).emergencyFreezePool();

            expect(await pool.activeDelegatees()).to.include(delegatee.address);
            const frozenUntil = await pool.frozenUntil();
            expect(frozenUntil).to.be.gte(BigInt(latestBlock) + BigInt(FREEZE_PERIOD));
        });

        it("emits EmergencyFreeze event with correct frozenUntil", async function () {
            const { pool, guardian } = await restore();

            const latestTime = BigInt(await time.latest());

            await expect(pool.connect(guardian).emergencyFreezePool())
                .to.emit(pool, "EmergencyFreeze")
                .withArgs((until: bigint) => until >= latestTime + BigInt(FREEZE_PERIOD));
        });

        it("blocks coordinator actions while frozen", async function () {
            const { pool, guardian, coordinator, delegatee } = await restore();

            await pool.connect(guardian).emergencyFreezePool();

            await expect(
                pool
                    .connect(coordinator)
                    .delegate(delegatee.address, ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(pool, "PoolFrozen");
        });

        it("coordinator actions succeed after freeze expires", async function () {
            const { pool, guardian, coordinator, delegatee } = await restore();

            await pool.connect(guardian).emergencyFreezePool();
            await time.increase(FREEZE_PERIOD + 1);

            await pool
                .connect(coordinator)
                .delegate(delegatee.address, ethers.parseEther("100"));
        });

        it("calling freeze again extends the freeze window", async function () {
            const { pool, guardian } = await restore();

            await pool.connect(guardian).emergencyFreezePool();
            const frozenUntilFirst = await pool.frozenUntil();

            await pool.connect(guardian).emergencyFreezePool();
            const frozenUntilSecond = await pool.frozenUntil();

            expect(frozenUntilSecond).to.be.gt(frozenUntilFirst);
        });
    });

    describe("halt", function () {
        it("reverts if caller is not the factory", async function () {
            const { pool, other } = await restoreDelegated();

            await expect(pool.connect(other).halt(other.address))
                .to.be.revertedWithCustomError(pool, "NotFactory")
                .withArgs(other.address, await pool.factory());
        });

        it("recalls all delegatees and transfers balance to recipient", async function () {
            const {
                pool,
                poolFactory,
                governance,
                coordinator,
                other,
                token,
                AMOUNT
            } = await restore();

            const [, , , , , delegatee1, delegatee2, delegatee3] = await ethers.getSigners();

            const amount1 = AMOUNT / 4n;
            const amount2 = AMOUNT / 6n;
            const amount3 = AMOUNT / 8n;
            const totalDelegated = amount1 + amount2 + amount3;

            await pool.connect(coordinator).delegate(delegatee1.address, amount1);
            await pool.connect(coordinator).delegate(delegatee2.address, amount2);
            await pool.connect(coordinator).delegate(delegatee3.address, amount3);

            const franchiser1 = await pool.getFranchiser(delegatee1.address);
            const franchiser2 = await pool.getFranchiser(delegatee2.address);
            const franchiser3 = await pool.getFranchiser(delegatee3.address);

            // Pool holds AMOUNT - totalDelegated; halt recalls all then sends full AMOUNT out.
            // Net pool change = -(AMOUNT - totalDelegated).
            await expect(
                poolFactory.connect(governance).haltPool(
                    await pool.getAddress(),
                    other.address
                )
            ).to.changeTokenBalances(
                ethers,
                token,
                [pool, other],
                [-(AMOUNT - totalDelegated), AMOUNT]
            );

            expect(await token.balanceOf(franchiser1)).to.equal(0n);
            expect(await token.balanceOf(franchiser2)).to.equal(0n);
            expect(await token.balanceOf(franchiser3)).to.equal(0n);

            expect(await token.getCurrentVotes(delegatee1.address)).to.equal(0n);
            expect(await token.getCurrentVotes(delegatee2.address)).to.equal(0n);
            expect(await token.getCurrentVotes(delegatee3.address)).to.equal(0n);

            expect(await pool.activeDelegatees()).to.be.empty;
        });

        it("emits Halted event", async function () {
            const { pool, poolFactory, governance, other } = await restoreDelegated();

            await expect(
                poolFactory
                    .connect(governance)
                    .haltPool(await pool.getAddress(), other.address)
            )
                .to.emit(pool, "Halted")
                .withArgs(other.address);
        });

        it("reverts if recipient is zero address", async function () {
            const { pool, poolFactory, governance } = await restoreDelegated();

            await expect(
                poolFactory
                    .connect(governance)
                    .haltPool(await pool.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });
    });

    describe("setCoordinator", function () {
        it("reverts if caller is not the factory", async function () {
            const { pool, other } = await restore();

            await expect(pool.connect(other).setCoordinator(other.address))
                .to.be.revertedWithCustomError(pool, "NotFactory")
                .withArgs(other.address, await pool.factory());
        });

        it("updates coordinator and emits CoordinatorSet", async function () {
            const { pool, poolFactory, governance, other } = await restore();

            const oldCoordinator = await pool.coordinator();

            await expect(
                poolFactory
                    .connect(governance)
                    .setCoordinator(await pool.getAddress(), other.address)
            )
                .to.emit(pool, "CoordinatorSet")
                .withArgs(oldCoordinator, other.address);

            expect(await pool.coordinator()).to.equal(other.address);
        });

        it("reverts if new coordinator is zero address", async function () {
            const { pool, poolFactory, governance } = await restore();

            await expect(
                poolFactory
                    .connect(governance)
                    .setCoordinator(await pool.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });

        it("reverts if new coordinator equals the current guardian", async function () {
            const { pool, poolFactory, governance, guardian } = await restore();

            await expect(
                poolFactory
                    .connect(governance)
                    .setCoordinator(await pool.getAddress(), guardian.address)
            )
                .to.be.revertedWithCustomError(pool, "CoordinatorGuardianCollision")
                .withArgs(guardian.address);
        });

        it("reverts if new coordinator equals the current coordinator", async function () {
            const { pool, poolFactory, governance, coordinator } = await restore();

            await expect(
                poolFactory
                    .connect(governance)
                    .setCoordinator(await pool.getAddress(), coordinator.address)
            )
                .to.be.revertedWithCustomError(pool, "AddressCollision")
                .withArgs(coordinator.address);
        });
    });

    describe("setGuardian", function () {
        it("reverts if caller is not the factory", async function () {
            const { pool, other } = await restore();

            await expect(pool.connect(other).setGuardian(other.address))
                .to.be.revertedWithCustomError(pool, "NotFactory")
                .withArgs(other.address, await pool.factory());
        });

        it("updates guardian and emits GuardianSet", async function () {
            const { pool, poolFactory, governance, other } = await restore();

            const oldGuardian = await pool.guardian();

            await expect(
                poolFactory
                    .connect(governance)
                    .setGuardian(await pool.getAddress(), other.address)
            )
                .to.emit(pool, "GuardianSet")
                .withArgs(oldGuardian, other.address);

            expect(await pool.guardian()).to.equal(other.address);
        });

        it("reverts if new guardian is zero address", async function () {
            const { pool, poolFactory, governance } = await restore();

            await expect(
                poolFactory
                    .connect(governance)
                    .setGuardian(await pool.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });

        it("reverts if new guardian equals the current coordinator", async function () {
            const { pool, poolFactory, governance, coordinator } = await restore();

            await expect(
                poolFactory
                    .connect(governance)
                    .setGuardian(await pool.getAddress(), coordinator.address)
            )
                .to.be.revertedWithCustomError(pool, "CoordinatorGuardianCollision")
                .withArgs(coordinator.address);
        });

        it("reverts if new guardian equals the current guardian", async function () {
            const { pool, poolFactory, governance, guardian } = await restore();

            await expect(
                poolFactory
                    .connect(governance)
                    .setGuardian(await pool.getAddress(), guardian.address)
            )
                .to.be.revertedWithCustomError(pool, "AddressCollision")
                .withArgs(guardian.address);
        });
    });

    describe("setMaxDelegatees", function () {
        it("reverts if caller is not the factory", async function () {
            const { pool, other } = await restore();

            await expect(pool.connect(other).setMaxDelegatees(10n))
                .to.be.revertedWithCustomError(pool, "NotFactory")
                .withArgs(other.address, await pool.factory());
        });

        it("reverts with ZeroAmount when maxDelegatees_ is 0", async function () {
            const { pool, poolFactory, governance } = await restore();

            await expect(
                poolFactory.connect(governance).setMaxDelegatees(await pool.getAddress(), 0n)
            ).to.be.revertedWithCustomError(pool, "ZeroAmount");
        });

        it("reverts with MaxDelegateesExceedsLimit when maxDelegatees_ exceeds DELEGATEES_LIMIT", async function () {
            const { pool, poolFactory, governance } = await restore();
            const limit = await pool.DELEGATEES_LIMIT();

            await expect(
                poolFactory.connect(governance).setMaxDelegatees(await pool.getAddress(), limit + 1n)
            )
                .to.be.revertedWithCustomError(pool, "MaxDelegateesExceedsLimit")
                .withArgs(limit + 1n, limit);
        });

        it("updates maxDelegatees and emits MaxDelegateesSet", async function () {
            const {
                pool,
                poolFactory,
                governance,
                MAX_DELEGATEES
            } = await restore();

            await expect(
                poolFactory
                    .connect(governance)
                    .setMaxDelegatees(await pool.getAddress(), 10n)
            )
                .to.emit(pool, "MaxDelegateesSet")
                .withArgs(MAX_DELEGATEES, 10n);

            expect(await pool.maxDelegatees()).to.equal(10n);
        });
    });

    describe("setFreezePeriod", function () {
        it("reverts if caller is not the factory", async function () {
            const { pool, other } = await restore();

            await expect(
                pool.connect(other).setFreezePeriod(BigInt(FREEZE_PERIOD))
            )
                .to.be.revertedWithCustomError(pool, "NotFactory")
                .withArgs(other.address, await pool.factory());
        });

        it("reverts if freeze period is below minimum", async function () {
            const { pool, poolFactory, governance } = await restore();

            await expect(
                poolFactory
                    .connect(governance)
                    .setFreezePeriod(await pool.getAddress(), BigInt(FREEZE_PERIOD - 1))
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooShort");
        });

        it("reverts if freeze period is above maximum", async function () {
            const { pool, poolFactory, governance } = await restore();
            
            await expect(
                poolFactory
                    .connect(governance)
                    .setFreezePeriod(await pool.getAddress(), BigInt(MAXIMUM_FREEZE_PERIOD + 1))
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooLong");
        });

        it("updates freezePeriod and emits FreezePeriodSet", async function () {
            const { pool, poolFactory, governance } = await restore();

            const newPeriod = BigInt(FREEZE_PERIOD * 2);

            await expect(
                poolFactory
                    .connect(governance)
                    .setFreezePeriod(await pool.getAddress(), newPeriod)
            )
                .to.emit(pool, "FreezePeriodSet")
                .withArgs(BigInt(FREEZE_PERIOD), newPeriod);

            expect(await pool.freezePeriod()).to.equal(newPeriod);
        });
    });

    describe("unfreeze", function () {
        it("reverts if caller is not the factory", async function () {
            const { pool, guardian, other } = await restore();

            await pool.connect(guardian).emergencyFreezePool();
            await expect(pool.connect(other).unfreeze())
                .to.be.revertedWithCustomError(pool, "NotFactory")
                .withArgs(other.address, await pool.factory());
        });

        it("clears frozenUntil and emits PoolUnfrozen", async function () {
            const {
                pool,
                poolFactory,
                governance,
                guardian
            } = await restore();

            await pool.connect(guardian).emergencyFreezePool();

            expect(await pool.frozenUntil()).to.be.gt(0n);

            await expect(
                poolFactory
                    .connect(governance)
                    .unfreezePool(await pool.getAddress())
            ).to.emit(pool, "PoolUnfrozen");

            expect(await pool.frozenUntil()).to.equal(0n);
        });

        it("allows coordinator to act after factory unfreeze", async function () {
            const {
                pool,
                poolFactory,
                governance,
                guardian,
                coordinator,
                delegatee
            } = await restore();

            await pool.connect(guardian).emergencyFreezePool();
            await poolFactory
                .connect(governance)
                .unfreezePool(await pool.getAddress());

            // Should not revert
            await pool
                .connect(coordinator)
                .delegate(delegatee.address, ethers.parseEther("100"));
        });
    });
});
