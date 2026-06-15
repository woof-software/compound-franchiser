import { expect } from "chai";
import { network } from "hardhat";
import { EventLog } from "ethers";

const { ethers, networkHelpers } = await network.create();

const FREEZE_PERIOD = 10 * 24 * 3600; // 10 days in seconds
const MAXIMUM_FREEZE_PERIOD = 30 * 24 * 3600; // 30 days in seconds

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function deployFixture() {
    const [governance, coordinator, guardian, other] = await ethers.getSigners();

    const token = await ethers.deployContract("MockVotingToken");
    const factory = await ethers.deployContract("FranchiserPoolFactory", [
        await token.getAddress(),
        governance.address,
    ]);

    const AMOUNT = ethers.parseEther("10000");
    await token.mint(governance.address, AMOUNT * 10n);
    await token.connect(governance).approve(await factory.getAddress(), ethers.MaxUint256);

    return { governance, coordinator, guardian, other, token, factory, AMOUNT };
}

async function poolCreatedFixture() {
    const base = await deployFixture();
    const { governance, coordinator, guardian, factory, AMOUNT } = base;

    const tx = await factory.connect(governance).createPool(
        coordinator.address,
        guardian.address,
        5n,
        FREEZE_PERIOD,
        AMOUNT
    );
    const receipt = await tx.wait();
    const event = receipt?.logs.find(
        (log) =>
            log.topics[0] ===
            factory.interface.getEvent("PoolCreated").topicHash
    );
    const poolAddr = event ? (factory.interface.parseLog(event)?.args[0] as string) : "";
    const pool = await ethers.getContractAt("FranchiserPool", poolAddr);

    return { ...base, pool, poolAddr };
}

const restore = async () => await networkHelpers.loadFixture(deployFixture);
const restorePool = async () => await networkHelpers.loadFixture(poolCreatedFixture);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FranchiserPoolFactory", function () {
    describe("deployment", function () {
        it("stores the voting token", async function () {
            const { factory, token } = await restore();

            expect(await factory.votingToken()).to.equal(await token.getAddress());
        });

        it("stores the governance address", async function () {
            const { factory, governance } = await restore();

            expect(await factory.governance()).to.equal(governance.address);
        });

        it("MINIMUM_FREEZE_PERIOD is 10 days", async function () {
            const { factory } = await restore();

            expect(await factory.MINIMUM_FREEZE_PERIOD()).to.equal(BigInt(FREEZE_PERIOD));
        });

        it("reverts if governance is zero address", async function () {
            const { factory, token } = await restore();

            await expect(
                ethers.deployContract("FranchiserPoolFactory", [
                    await token.getAddress(),
                    ethers.ZeroAddress,
                ])
            ).to.be.revertedWithCustomError(factory, "ZeroAddress");
        });
    });

    describe("createPool", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, coordinator, guardian } = await restore();

            await expect(
                factory
                    .connect(other)
                    .createPool(
                        coordinator.address,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD,
                        0n
                    )
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if freeze period is below minimum", async function () {
            // FreezePeriodTooShort is a FranchiserPool error — use a pool instance for ABI lookup
            const { factory, governance, coordinator, guardian, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .createPool(
                        coordinator.address,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD - 1,
                        0n
                    )
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooShort");
        });

        it("reverts if freeze period is above maximum", async function () {
            // FreezePeriodTooLong is a FranchiserPool error — use a pool instance for ABI lookup
            const { factory, governance, coordinator, guardian, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .createPool(
                        coordinator.address,
                        guardian.address,
                        5n,
                        MAXIMUM_FREEZE_PERIOD + 1,
                        0n
                    )
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooLong");
        });

        it("deploys a new pool and registers it as known", async function () {
            const { factory, governance, coordinator, guardian } = await restore();

            const tx = await factory
                .connect(governance)
                .createPool(
                    coordinator.address,
                    guardian.address,
                    5n,
                    FREEZE_PERIOD,
                    0n
                );
            const receipt = await tx.wait();
            const event = receipt?.logs.find(
                (log) =>
                    log.topics[0] ===
                    factory.interface.getEvent("PoolCreated").topicHash
            );

            const poolAddr = event ? (factory.interface.parseLog(event)?.args[0] as string) : "";

            expect(await factory.isKnownPool(poolAddr)).to.be.true;
            expect(await factory.getAllPools()).to.include(poolAddr);
        });

        it("deploys several pools with different parameters", async function () {
            const { factory, governance, coordinator, guardian } = await restore();

            const params = [
                [coordinator.address, guardian.address, 5n, FREEZE_PERIOD, 0n],
                [coordinator.address, guardian.address, 10n, FREEZE_PERIOD * 2, ethers.parseEther("100")],
                [coordinator.address, guardian.address, 3n, FREEZE_PERIOD * 3 / 2, ethers.parseEther("50")],
            ];

            const poolAddresses: string[] = [];
            for (const [coordAddr, guardAddr, maxDel, freezePer, initAmt] of params) {
                const tx = await factory
                    .connect(governance)
                    .createPool(
                        coordAddr as string,
                        guardAddr as string,
                        maxDel as bigint,
                        freezePer as bigint,
                        initAmt as bigint
                    );
                const receipt = await tx.wait();
                const event = receipt?.logs.find(
                    (log) =>
                        log.topics[0] ===
                        factory.interface.getEvent("PoolCreated").topicHash
                );
                const poolAddr = event ? (factory.interface.parseLog(event)?.args[0] as string) : "";

                expect(await factory.isKnownPool(poolAddr)).to.be.true;
                expect(await factory.getAllPools()).to.include(poolAddr);
                poolAddresses.push(poolAddr);
            }

            expect(await factory.getAllPools()).to.deep.equal(poolAddresses);
        });

        it("emits PoolCreated with coordinator, guardian, and pool parameters", async function () {
            const { factory, governance, coordinator, guardian } = await restore();

            const receipt = await (
                await factory
                    .connect(governance)
                    .createPool(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, 0n)
            ).wait();

            const event = receipt?.logs.find(
                (log) =>
                    log.topics[0] ===
                    factory.interface.getEvent("PoolCreated").topicHash
            );
            const parsed = factory.interface.parseLog(event as unknown as EventLog);

            expect(parsed?.args[1]).to.equal(coordinator.address); // coordinator
            expect(parsed?.args[2]).to.equal(guardian.address);    // guardian
            expect(parsed?.args[3]).to.equal(5n);                  // maxDelegatees
            expect(parsed?.args[4]).to.equal(BigInt(FREEZE_PERIOD)); // freezePeriod
            expect(parsed?.args[5]).to.equal(0n);                  // initialAmount
        });

        it("transfers initial tokens from governance to pool when amount > 0", async function () {
            const {
                factory,
                governance,
                coordinator,
                guardian,
                token,
                AMOUNT
            } = await restore();

            const receipt = await (
                await factory
                    .connect(governance)
                    .createPool(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, AMOUNT)
            ).wait();
            const event = receipt?.logs.find(
                (log) =>
                    log.topics[0] ===
                    factory.interface.getEvent("PoolCreated").topicHash
            );
            const poolAddr = event ? (factory.interface.parseLog(event)?.args[0] as string) : "";

            expect(await token.balanceOf(poolAddr)).to.equal(AMOUNT);
        });

        it("reverts if coordinator is zero address", async function () {
            const { factory, governance, guardian, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .createPool(
                        ethers.ZeroAddress,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD,
                        0n
                    )
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });

        it("reverts if guardian is zero address", async function () {
            const { factory, governance, coordinator, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .createPool(
                        coordinator.address,
                        ethers.ZeroAddress,
                        5n,
                        FREEZE_PERIOD,
                        0n
                    )
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });

        it("does not transfer tokens when amount is 0", async function () {
            const {
                factory,
                governance,
                coordinator,
                guardian,
                token
            } = await restore();

            const receipt = await (
                await factory
                    .connect(governance)
                    .createPool(
                        coordinator.address,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD,
                        0n
                    )
            ).wait();
            const event = receipt?.logs.find(
                (log) =>
                    log.topics[0] ===
                    factory.interface.getEvent("PoolCreated").topicHash
            );
            const poolAddr = event ? (factory.interface.parseLog(event)?.args[0] as string) : "";

            expect(await token.balanceOf(poolAddr)).to.equal(0n);
        });
    });

    describe("fundPool", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .fundPool(await pool.getAddress(), ethers.parseEther("100"))
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .fundPool(other.address, ethers.parseEther("100"))
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("transfers tokens from governance to pool and emits PoolFunded", async function () {
            const { factory, governance, pool, token } = await restorePool();

            const fundAmount = ethers.parseEther("500");
            const poolAddr = await pool.getAddress();

            const poolBalanceBefore = await token.balanceOf(poolAddr);
            const govBalanceBefore = await token.balanceOf(governance.address);

            await expect(
                factory.connect(governance).fundPool(poolAddr, fundAmount)
            )
                .to.emit(factory, "PoolFunded")
                .withArgs(poolAddr, fundAmount);

            expect(await token.balanceOf(poolAddr)).to.equal(poolBalanceBefore + fundAmount);
            expect(await token.balanceOf(governance.address)).to.equal(govBalanceBefore - fundAmount);
        });
    });

    describe("transferToPool", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .transferToPool(await pool.getAddress(), ethers.parseEther("100"))
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .transferToPool(other.address, ethers.parseEther("100"))
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("transfers tokens from factory own balance to pool and emits PoolFunded", async function () {
            const { factory, governance, pool, token } = await restorePool();

            const transferAmount = ethers.parseEther("500");
            const factoryAddr = await factory.getAddress();
            const poolAddr = await pool.getAddress();

            // Seed the factory contract itself with tokens (safeTransfer, not safeTransferFrom)
            await token.mint(factoryAddr, transferAmount);

            const poolBalanceBefore = await token.balanceOf(poolAddr);

            await expect(
                factory.connect(governance).transferToPool(poolAddr, transferAmount)
            )
                .to.emit(factory, "PoolFunded")
                .withArgs(poolAddr, transferAmount);

            expect(await token.balanceOf(poolAddr)).to.equal(poolBalanceBefore + transferAmount);
            expect(await token.balanceOf(factoryAddr)).to.equal(0n);
        });

        it("pool can delegate tokens received via direct transfer", async function () {
            const {
                factory,
                governance,
                pool,
                token,
                coordinator,
                other
            } = await restorePool();

            const transferAmount = ethers.parseEther("500");
            const factoryAddr = await factory.getAddress();
            const poolAddr = await pool.getAddress();

            await token.mint(factoryAddr, transferAmount);
            await factory.connect(governance).transferToPool(poolAddr, transferAmount);

            // Coordinator should be able to delegate the freshly-transferred tokens
            await pool.connect(coordinator).delegate(other.address, transferAmount);

            expect(await token.getCurrentVotes(other.address)).to.equal(transferAmount);
            expect(await token.balanceOf(await pool.getFranchiser(other.address))).to.equal(transferAmount);
        });
    });

    describe("haltPool", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .haltPool(await pool.getAddress(), other.address)
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .haltPool(other.address, other.address)
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("reverts if recipient is zero address", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .haltPool(await pool.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });

        it("drains pool balance to recipient and emits PoolHalted", async function () {
            const {
                factory,
                governance,
                pool,
                other,
                token,
                AMOUNT
            } = await restorePool();

            const poolAddr = await pool.getAddress();

            await expect(
                factory
                    .connect(governance)
                    .haltPool(poolAddr, other.address)
            )
                .to.emit(factory, "PoolHalted")
                .withArgs(poolAddr, other.address);

            expect(await token.balanceOf(poolAddr)).to.equal(0n);
            expect(await token.balanceOf(other.address)).to.equal(AMOUNT);
        });
    });

    describe("setCoordinator", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .setCoordinator(await pool.getAddress(), other.address)
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .setCoordinator(other.address, other.address)
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("updates pool coordinator and emits CoordinatorUpdated", async function () {
            const { factory, governance, pool, other } = await restorePool();

            const poolAddr = await pool.getAddress();

            await expect(
                factory.connect(governance).setCoordinator(poolAddr, other.address)
            )
                .to.emit(factory, "CoordinatorUpdated")
                .withArgs(poolAddr, other.address);

            expect(await pool.coordinator()).to.equal(other.address);
        });

        it("reverts if new coordinator is zero address", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .setCoordinator(await pool.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });
    });

    describe("setGuardian", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .setGuardian(await pool.getAddress(), other.address)
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .setGuardian(other.address, other.address)
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("updates pool guardian and emits GuardianUpdated", async function () {
            const { factory, governance, pool, other } = await restorePool();

            const poolAddr = await pool.getAddress();

            await expect(
                factory.connect(governance).setGuardian(poolAddr, other.address)
            )
                .to.emit(factory, "GuardianUpdated")
                .withArgs(poolAddr, other.address);

            expect(await pool.guardian()).to.equal(other.address);
        });

        it("reverts if new guardian is zero address", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .setGuardian(await pool.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });
    });

    describe("setMaxDelegatees", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .setMaxDelegatees(await pool.getAddress(), 10n)
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .setMaxDelegatees(other.address, 10n)
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("updates pool maxDelegatees and emits MaxDelegateesUpdated", async function () {
            const { factory, governance, pool } = await restorePool();

            const poolAddr = await pool.getAddress();

            await expect(
                factory.connect(governance).setMaxDelegatees(poolAddr, 10n)
            )
                .to.emit(factory, "MaxDelegateesUpdated")
                .withArgs(poolAddr, 10n);

            expect(await pool.maxDelegatees()).to.equal(10n);
        });
    });

    describe("setFreezePeriod", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .setFreezePeriod(
                        await pool.getAddress(),
                        BigInt(FREEZE_PERIOD)
                    )
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .setFreezePeriod(other.address, BigInt(FREEZE_PERIOD))
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("reverts if new freeze period is below minimum", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .setFreezePeriod(
                        await pool.getAddress(),
                        BigInt(FREEZE_PERIOD - 1)
                    )
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooShort");
        });

        it("reverts if new freeze period is above maximum", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .setFreezePeriod(
                        await pool.getAddress(),
                        BigInt(MAXIMUM_FREEZE_PERIOD + 1)
                    )
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooLong");
        });

        it("updates pool freeze period and emits FreezePeriodUpdated", async function () {
            const { factory, governance, pool } = await restorePool();

            const poolAddr = await pool.getAddress();
            const newPeriod = BigInt(FREEZE_PERIOD * 2);

            await expect(
                factory.connect(governance).setFreezePeriod(poolAddr, newPeriod)
            )
                .to.emit(factory, "FreezePeriodUpdated")
                .withArgs(poolAddr, newPeriod);

            expect(await pool.freezePeriod()).to.equal(newPeriod);
        });
    });

    describe("unfreezePool", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory.connect(other).unfreezePool(await pool.getAddress())
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory.connect(governance).unfreezePool(other.address)
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("succeeds and emits PoolUnfrozen even when pool is not currently frozen", async function () {
            const { factory, governance, pool } = await restorePool();

            expect(await pool.frozenUntil()).to.equal(0n);

            await expect(
                factory.connect(governance).unfreezePool(await pool.getAddress())
            ).to.emit(pool, "PoolUnfrozen");

            expect(await pool.frozenUntil()).to.equal(0n);
        });

        it("unfreezes pool and emits PoolUnfrozen", async function () {
            const { factory, governance, pool } = await restorePool();

            const poolAddr = await pool.getAddress();

            // First freeze via guardian
            const guardian = await ethers.getSigner(await pool.guardian());
            await pool.connect(guardian).emergencyFreezePool();
            expect(await pool.frozenUntil()).to.be.gt(0n);

            await expect(
                factory.connect(governance).unfreezePool(poolAddr)
            )
                .to.emit(factory, "PoolUnfrozen")
                .withArgs(poolAddr);

            expect(await pool.frozenUntil()).to.equal(0n);
        });
    });
});
