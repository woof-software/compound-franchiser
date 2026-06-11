import { expect } from "chai";
import { network } from "hardhat";
import { EventLog } from "ethers";

const { ethers, networkHelpers } = await network.create();

const FREEZE_PERIOD = 10 * 24 * 3600; // 10 days in seconds

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
                    .createPool(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, 0n)
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
            const { factory, governance, pool } = await restorePool();

            const fundAmount = ethers.parseEther("500");
            const poolAddr = await pool.getAddress();

            await expect(
                factory.connect(governance).fundPool(poolAddr, fundAmount)
            )
                .to.emit(factory, "PoolFunded")
                .withArgs(poolAddr, fundAmount);
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
