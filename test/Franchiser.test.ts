import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const GOVERNANCE_ADDRESS = "0x6d903f6003cca6255D85CcA4D3B5E5146dC33925";
const FREEZE_PERIOD = 10n * 24n * 60n * 60n; // 10 days

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function deployFixture() {
    const [, coordinator, guardian, delegatee, subDelegatee, other] = await ethers.getSigners();

    await networkHelpers.setBalance(GOVERNANCE_ADDRESS, ethers.parseEther("100"));
    const governance = await ethers.getImpersonatedSigner(GOVERNANCE_ADDRESS);

    const token = await ethers.deployContract("MockVotingToken");
    const poolFactory = await ethers.deployContract("FranchiserPoolFactory", [
        await token.getAddress(),
    ]);

    const AMOUNT = ethers.parseEther("1000");
    await token.mint(governance.address, AMOUNT * 10n);
    await token.connect(governance).approve(await poolFactory.getAddress(), ethers.MaxUint256);

    return { coordinator, guardian, delegatee, subDelegatee, other, token, poolFactory, governance, AMOUNT };
}

async function fundedFranchiserFixture() {
    const base = await deployFixture();
    const { coordinator, guardian, delegatee, poolFactory, governance, AMOUNT } = base;

    await poolFactory.connect(governance).createPool(
        coordinator.address,
        guardian.address,
        10n,
        FREEZE_PERIOD,
        AMOUNT
    );
    const [poolAddr] = await poolFactory.getAllPools();
    const pool = await ethers.getContractAt("FranchiserPool", poolAddr);

    await pool.connect(coordinator).delegate(delegatee.address, AMOUNT);

    const franchiserAddr = await pool.getFranchiser(delegatee.address);
    const franchiser = await ethers.getContractAt("Franchiser", franchiserAddr);

    return { ...base, pool, poolAddr, franchiser, franchiserAddr };
}

const restore = async () => await networkHelpers.loadFixture(fundedFranchiserFixture);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Franchiser", function () {
    describe("constants", function () {
        it("DECAY_FACTOR is 2", async function () {
            const { franchiser } = await restore();
            expect(await franchiser.DECAY_FACTOR()).to.equal(2n);
        });

        it("franchiserImplementation is set", async function () {
            const { franchiser, pool } = await restore();

            const implAddr = await franchiser.franchiserImplementation();
            expect(implAddr).to.not.equal(ethers.ZeroAddress);

            const poolImpl = await pool.franchiserImplementation();
            expect(implAddr).to.equal(poolImpl);
        });
    });

    describe("initialize", function () {
        it("reverts with NoDelegatee when delegatee_ is zero address", async function () {
            const { franchiser } = await restore();

            // NoDelegatee is checked before AlreadyInitialized
            await expect(
                franchiser["initialize(address,uint96)"](ethers.ZeroAddress, 0n)
            ).to.be.revertedWithCustomError(franchiser, "NoDelegatee");
        });

        it("reverts with AlreadyInitialized on second call", async function () {
            const { franchiser, delegatee } = await restore();

            await expect(
                franchiser.connect(delegatee)["initialize(address,uint96)"](delegatee.address, 1n)
            ).to.be.revertedWithCustomError(franchiser, "AlreadyInitialized");
        });

        it("sets delegatee correctly", async function () {
            const { franchiser, delegatee } = await restore();

            expect(await franchiser.delegatee()).to.equal(delegatee.address);
        });

        it("sets owner to the pool", async function () {
            const { franchiser, poolAddr } = await restore();

            expect(await franchiser.owner()).to.equal(poolAddr);
        });

        it("sets maximumSubDelegatees from pool constant", async function () {
            const { franchiser, pool } = await restore();

            const expected = await pool.INITIAL_MAXIMUM_SUBDELEGATEES();
            expect(await franchiser.maximumSubDelegatees()).to.equal(expected);
        });

        it("emits Initialized event", async function () {
            const { coordinator, guardian, poolFactory, governance, delegatee, AMOUNT } =
                await networkHelpers.loadFixture(deployFixture);

            await poolFactory.connect(governance).createPool(
                coordinator.address,
                guardian.address,
                10n,
                FREEZE_PERIOD,
                AMOUNT
            );
            const [poolAddr] = await poolFactory.getAllPools();
            const pool = await ethers.getContractAt("FranchiserPool", poolAddr);

            const franchiserAddr = await pool.getFranchiser(delegatee.address);
            const franchiser = await ethers.getContractAt("Franchiser", franchiserAddr);

            await expect(pool.connect(coordinator).delegate(delegatee.address, AMOUNT))
                .to.emit(franchiser, "Initialized")
                .withArgs(poolAddr, poolAddr, delegatee.address, 1n);
        });

        it("delegates voting power to delegatee", async function () {
            const { token, delegatee, AMOUNT } = await restore();

            // The franchiser's balance counts as voting power for the delegatee
            const votes = await token.getCurrentVotes(delegatee.address);
            expect(votes).to.eq(AMOUNT);
        });
    });

    describe("delegator", function () {
        it("returns the pool address as explicit delegator", async function () {
            const { franchiser, poolAddr } = await restore();
            expect(await franchiser.delegator()).to.equal(poolAddr);
        });

        it("returns zero address for an uninitialized clone", async function () {
            const { pool } = await restore();
            const implAddr = await pool.franchiserImplementation();
            const implHex = implAddr.slice(2).toLowerCase();
            // EIP-1167 minimal proxy bytecode pointing at the implementation
            const proxyBytecode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${implHex}5af43d82803e903d91602b57fd5bf3`;
            const [signer] = await ethers.getSigners();

            const tx = await signer.sendTransaction({ data: proxyBytecode });
            const receipt = await tx.wait();

            const contractAddr = receipt?.contractAddress ?? ethers.ZeroAddress;
            const uninitClone = await ethers.getContractAt("Franchiser", contractAddr);
            // Both _delegator and owner() are address(0) → falls through to return address(0)
            expect(await uninitClone.delegator()).to.equal(ethers.ZeroAddress);
        });

        it("sub-franchiser delegator is derived from parent franchiser's delegatee", async function () {
            const { franchiser, delegatee, subDelegatee, token, AMOUNT } = await restore();

            const mainDelegateeVotesBefore = await token.getCurrentVotes(delegatee.address);
            const subDelegateeVotesBefore = await token.getCurrentVotes(subDelegatee.address);

            await franchiser.connect(delegatee).subDelegate(subDelegatee.address, AMOUNT / 2n);

            const mainDelegateeVotesAfter = await token.getCurrentVotes(delegatee.address);
            const subDelegateeVotesAfter = await token.getCurrentVotes(subDelegatee.address);

            // Delegatee loses votes, sub-delegatee gains votes
            expect(mainDelegateeVotesAfter).to.be.equal(mainDelegateeVotesBefore - AMOUNT / 2n);
            expect(subDelegateeVotesAfter).to.be.equal(subDelegateeVotesBefore + AMOUNT / 2n);

            const subAddr = await franchiser.getFranchiser(subDelegatee.address);
            const subFranchiser = await ethers.getContractAt(
                "Franchiser",
                subAddr
            );

            // Sub-franchiser has no explicit delegator, derives it from parent
            expect(await subFranchiser.delegator()).to.equal(delegatee.address);
        });
    });

    describe("subDelegate", function () {
        it("reverts if caller is not the delegatee", async function () {
            const { franchiser, other, subDelegatee } = await restore();
            await expect(
                franchiser
                    .connect(other)
                    .subDelegate(subDelegatee.address, 100n)
            )
                .to.be.revertedWithCustomError(franchiser, "NotDelegatee")
                .withArgs(other.address, await franchiser.delegatee());
        });

        it("creates a clone franchiser for the sub-delegatee", async function () {
            const { franchiser, delegatee, subDelegatee, AMOUNT } = await restore();

            const predictedAddr = await franchiser.getFranchiser(subDelegatee.address);

            // No contract
            expect(
                (await ethers.provider.getCode(predictedAddr)).length
            ).to.equal(2); // "0x"

            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            // Now there is code at the predicted address
            expect(
                (await ethers.provider.getCode(predictedAddr)).length
            ).to.be.gt(2);
        });

        it("transfers tokens to the sub-franchiser", async function () {
            const { franchiser, delegatee, subDelegatee, token, AMOUNT } = await restore();

            const subAmount = AMOUNT / 2n;
            const subAddr = await franchiser.getFranchiser(subDelegatee.address);

            await expect(
                franchiser
                    .connect(delegatee)
                    .subDelegate(subDelegatee.address, subAmount)
            ).to.changeTokenBalances(
                ethers,
                token,
                [franchiser, subAddr],
                [-subAmount, subAmount]
            );
        });

        it("emits SubDelegateeActivated on first sub-delegation", async function () {
            const { franchiser, delegatee, subDelegatee, AMOUNT } = await restore();

            await expect(
                franchiser
                    .connect(delegatee)
                    .subDelegate(subDelegatee.address, AMOUNT / 2n)
            )
                .to.emit(franchiser, "SubDelegateeActivated")
                .withArgs(subDelegatee.address);
        });

        it("does not re-emit SubDelegateeActivated on repeated sub-delegation", async function () {
            const { franchiser, delegatee, subDelegatee, AMOUNT } = await restore();

            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            // Second sub-delegation to same address should NOT emit SubDelegateeActivated
            await expect(
                franchiser
                    .connect(delegatee)
                    .subDelegate(subDelegatee.address, AMOUNT / 2n)
            ).to.not.emit(franchiser, "SubDelegateeActivated");
        });

        it("reverts at the maximumSubDelegatees cap", async function () {
            const { franchiser, delegatee, subDelegatee, other, AMOUNT } = await restore();

            // First sub-delegation fills the single slot (max = 1)
            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            // Second to a different address should revert
            await expect(
                franchiser
                    .connect(delegatee)
                    .subDelegate(other.address, AMOUNT / 2n)
            )
                .to.be.revertedWithCustomError(
                    franchiser,
                    "CannotExceedMaximumSubDelegatees"
                )
                .withArgs(1n);
        });

        it("sub-franchiser receives zero maximumSubDelegatees (1 / DECAY_FACTOR)", async function () {
            const { franchiser, delegatee, subDelegatee, AMOUNT } = await restore();

            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            const subAddr = await franchiser.getFranchiser(subDelegatee.address);
            const subFranchiser = await ethers.getContractAt(
                "Franchiser",
                subAddr
            );
            expect(await subFranchiser.maximumSubDelegatees()).to.equal(0n);
        });

        it("adds sub-delegatee to the subDelegatees set", async function () {
            const { franchiser, delegatee, subDelegatee, AMOUNT } = await restore();

            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            const subs = await franchiser.subDelegatees();
            expect(subs).to.include(subDelegatee.address);
        });
    });

    describe("subDelegateMany", function () {
        it("reverts when array lengths differ", async function () {
            const { franchiser, delegatee, subDelegatee } = await restore();

            await expect(
                franchiser
                    .connect(delegatee)
                    .subDelegateMany([subDelegatee.address], [100n, 200n])
            )
                .to.be.revertedWithCustomError(franchiser, "ArrayLengthMismatch")
                .withArgs(1n, 2n);
        });

        it("delegates to multiple sub-delegatees in one call", async function () {
            const { franchiser, delegatee, subDelegatee, token, AMOUNT } = await restore();

            const mainDelegateeVotesBefore = await token.getCurrentVotes(delegatee.address);
            const subDelegateeVotesBefore = await token.getCurrentVotes(subDelegatee.address);

            // Only one sub-delegatee allowed (max=1), so test with one
            await franchiser
                .connect(delegatee)
                .subDelegateMany([subDelegatee.address], [AMOUNT / 2n]);

            const subAddr = await franchiser.getFranchiser(subDelegatee.address);

            expect(await token.balanceOf(subAddr)).to.equal(AMOUNT / 2n);

            expect(await token.getCurrentVotes(delegatee.address)).to.be.equal(mainDelegateeVotesBefore - AMOUNT / 2n);
            expect(await token.getCurrentVotes(subDelegatee.address)).to.be.equal(subDelegateeVotesBefore + AMOUNT / 2n);
        });
    });

    describe("unSubDelegate", function () {
        async function subDelegatedFixture() {
            const base = await fundedFranchiserFixture();

            const { franchiser, delegatee, subDelegatee, AMOUNT } = base;

            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            return base;
        }

        it("reverts if caller is not the delegatee", async function () {
            const { franchiser, other, subDelegatee } = await networkHelpers.loadFixture(subDelegatedFixture);

            await expect(
                franchiser.connect(other).unSubDelegate(subDelegatee.address)
            )
                .to.be.revertedWithCustomError(franchiser, "NotDelegatee")
                .withArgs(other.address, await franchiser.delegatee());
        });

        it("returns tokens from the sub-franchiser to the parent", async function () {
            const { franchiser, delegatee, subDelegatee, token } = await networkHelpers.loadFixture(subDelegatedFixture);

            const subAddr = await franchiser.getFranchiser(subDelegatee.address);
            const subBalance = await token.balanceOf(subAddr);

            await expect(
                franchiser.connect(delegatee).unSubDelegate(subDelegatee.address)
            ).to.changeTokenBalances(
                ethers,
                token,
                [subAddr, franchiser],
                [-subBalance, subBalance]
            );
        });

        it("emits SubDelegateeDeactivated", async function () {
            const { franchiser, delegatee, subDelegatee } = await networkHelpers.loadFixture(subDelegatedFixture);

            await expect(
                franchiser.connect(delegatee).unSubDelegate(subDelegatee.address)
            )
                .to.emit(franchiser, "SubDelegateeDeactivated")
                .withArgs(subDelegatee.address);
        });

        it("removes sub-delegatee from the subDelegatees set", async function () {
            const { franchiser, delegatee, subDelegatee } = await networkHelpers.loadFixture(subDelegatedFixture);

            await franchiser
                .connect(delegatee)
                .unSubDelegate(subDelegatee.address);

            expect(await franchiser.subDelegatees()).to.not.include(subDelegatee.address);
        });

        it("is a no-op for an address that was never a sub-delegatee", async function () {
            const { franchiser, delegatee, other } = await networkHelpers.loadFixture(subDelegatedFixture);

            // Should not revert, just does nothing
            await franchiser.connect(delegatee).unSubDelegate(other.address);
        });

        it("recovers tokens sent out-of-band to an already-unsubdelegated franchiser", async function () {
            const { franchiser, delegatee, subDelegatee, token } = await networkHelpers.loadFixture(subDelegatedFixture);

            // Remove subDelegatee from the active set (franchiser contract stays deployed)
            await franchiser.connect(delegatee).unSubDelegate(subDelegatee.address);

            const subFranchiserAddr = await franchiser.getFranchiser(subDelegatee.address);
            const outOfBandAmount = ethers.parseEther("100");

            // Send tokens directly to the sub-franchiser (out-of-band)
            await token.mint(subFranchiserAddr, outOfBandAmount);
            expect(await token.balanceOf(subFranchiserAddr)).to.equal(outOfBandAmount);

            // Second unSubDelegate: not in active set, but contract exists → recovers tokens
            await franchiser.connect(delegatee).unSubDelegate(subDelegatee.address);
            expect(await token.balanceOf(subFranchiserAddr)).to.equal(0n);
        });
    });

    describe("unSubDelegateMany", function () {
        it("un-delegates multiple sub-delegatees", async function () {
            const { franchiser, delegatee, subDelegatee, token, AMOUNT } = await restore();

            await franchiser.connect(delegatee).subDelegate(subDelegatee.address, AMOUNT / 2n);

            const mainDelegateeVotesBefore = await token.getCurrentVotes(delegatee.address);
            const subDelegateeVotesBefore = await token.getCurrentVotes(subDelegatee.address);
            expect(subDelegateeVotesBefore).to.be.equal(AMOUNT / 2n);

            await franchiser.connect(delegatee).unSubDelegateMany([subDelegatee.address]);

            expect(await token.getCurrentVotes(delegatee.address)).to.be.equal(mainDelegateeVotesBefore + subDelegateeVotesBefore);
            expect(await token.getCurrentVotes(subDelegatee.address)).to.be.equal(0);

            expect(await franchiser.subDelegatees()).to.be.empty;
        });

        it("reverts if caller is not the delegatee", async function () {
            const { franchiser, other, subDelegatee } = await restore();

            await expect(
                franchiser.connect(other).unSubDelegateMany([subDelegatee.address])
            ).to.be.revertedWithCustomError(franchiser, "NotDelegatee")
                .withArgs(other.address, await franchiser.delegatee());
        });
    });

    describe("recall", function () {
        it("reverts if caller is not the owner (pool)", async function () {
            const { franchiser, other } = await restore();

            await expect(
                franchiser.connect(other).recall(other.address)
            ).to.be.revertedWithCustomError(franchiser, "OwnableUnauthorizedAccount");
        });

        it("transfers the full balance back to the pool when coordinator recalls", async function () {
            const { franchiser, pool, poolAddr, coordinator, delegatee, token, AMOUNT } = await restore();

            const delegateeVotesBefore = await token.getCurrentVotes(delegatee.address);

            await expect(
                pool.connect(coordinator).recall(delegatee.address)
            ).to.changeTokenBalances(
                ethers,
                token,
                [franchiser, poolAddr],
                [-AMOUNT, AMOUNT]
            );

            expect(await token.getCurrentVotes(delegatee.address)).to.be.equal(delegateeVotesBefore - AMOUNT);
        });

        it("also recalls tokens from active sub-franchisers", async function () {
            const {
                franchiser,
                pool,
                poolAddr,
                coordinator,
                delegatee,
                subDelegatee,
                token,
                AMOUNT,
            } = await restore();

            const mainDelegateeVotesBefore = await token.getCurrentVotes(delegatee.address);
            const subDelegateeVotesBefore = await token.getCurrentVotes(subDelegatee.address);

            await franchiser.connect(delegatee).subDelegate(subDelegatee.address, AMOUNT / 2n);

            expect(await token.getCurrentVotes(delegatee.address)).to.be.equal(mainDelegateeVotesBefore - AMOUNT / 2n);
            expect(await token.getCurrentVotes(subDelegatee.address)).to.be.equal(subDelegateeVotesBefore + AMOUNT / 2n);

            const subAddr = await franchiser.getFranchiser(subDelegatee.address);

            await pool.connect(coordinator).recall(delegatee.address);

            expect(await token.getCurrentVotes(delegatee.address)).to.be.equal(0);
            expect(await token.getCurrentVotes(subDelegatee.address)).to.be.equal(0);

            expect(await token.balanceOf(poolAddr)).to.equal(AMOUNT);
            expect(await token.balanceOf(await franchiser.getAddress())).to.equal(0n);
            expect(await token.balanceOf(subAddr)).to.equal(0n);
        });
    });
});
