import { expect } from "chai";
import { network } from "hardhat";
import { Signature } from "ethers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import { MockVotingToken } from "../types/ethers-contracts/mocks/MockVotingToken.js";

const { ethers, networkHelpers } = await network.create();

// ── Permit helper ─────────────────────────────────────────────────────────────

async function signPermit(
    signer: HardhatEthersSigner,
    token: MockVotingToken,
    spender: string,
    value: bigint,
    deadline: number
): Promise<{ v: number; r: string; s: string }> {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = {
        name: await token.name(),
        version: "1",
        chainId,
        verifyingContract: await token.getAddress(),
    };
    const types = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    };
    const nonce = await token.nonces(signer.address);
    const message = {
        owner: signer.address,
        spender,
        value,
        nonce,
        deadline,
    };
    const sig = Signature.from(
        await signer.signTypedData(domain, types, message)
    );
    return { v: sig.v, r: sig.r, s: sig.s };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function deployFixture() {
    const [funder, delegatee, delegatee2, other] = await ethers.getSigners();

    const token = await ethers.deployContract("MockVotingToken");
    const factory = await ethers.deployContract("FranchiserFactory", [
        await token.getAddress(),
    ]);

    const AMOUNT = ethers.parseEther("1000");
    await token.mint(funder.address, AMOUNT * 20n);
    await token.connect(funder).approve(await factory.getAddress(), ethers.MaxUint256);

    return { funder, delegatee, delegatee2, other, token, factory, AMOUNT };
}

async function fundedFixture() {
    const base = await deployFixture();
    const { funder, delegatee, factory, AMOUNT } = base;

    await factory.connect(funder).fund(delegatee.address, AMOUNT);
    const franchiserAddr = await factory.getFranchiser(funder.address, delegatee.address);
    const franchiser = await ethers.getContractAt("Franchiser", franchiserAddr);

    return { ...base, franchiser, franchiserAddr };
}

const restore = async () => await networkHelpers.loadFixture(deployFixture);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FranchiserFactory", function () {
    describe("deployment", function () {
        it("stores the voting token", async function () {
            const { factory, token } = await restore();

            expect(await factory.votingToken()).to.equal(await token.getAddress());
        });

        it("deploys a franchiser implementation", async function () {
            const { factory } = await restore();

            const impl = await factory.franchiserImplementation();
            expect(impl).to.not.equal(ethers.ZeroAddress);
            expect((await ethers.provider.getCode(impl)).length).to.be.gt(2);
        });

        it("INITIAL_MAXIMUM_SUBDELEGATEES is 1", async function () {
            const { factory } = await restore();

            expect(await factory.INITIAL_MAXIMUM_SUBDELEGATEES()).to.equal(1n);
        });
    });

    describe("getFranchiser", function () {
        it("returns a deterministic address before deployment", async function () {
            const { factory, funder, delegatee } = await restore();

            const predicted = await factory.getFranchiser(funder.address, delegatee.address);

            expect(predicted).to.be.properAddress;
            expect((await ethers.provider.getCode(predicted)).length).to.equal(2); // not deployed yet
        });

        it("returns the same address after fund deploys the franchiser", async function () {
            const { factory, funder, delegatee, AMOUNT } = await restore();

            const predicted = await factory.getFranchiser(funder.address, delegatee.address);
            await factory.connect(funder).fund(delegatee.address, AMOUNT);

            expect((await ethers.provider.getCode(predicted)).length).to.be.gt(2);
        });
    });

    describe("fund", function () {
        it("deploys a new franchiser clone for a new delegatee", async function () {
            const { factory, funder, delegatee, AMOUNT } = await restore();

            const franchiserAddr = await factory.getFranchiser(funder.address, delegatee.address);
            expect((await ethers.provider.getCode(franchiserAddr)).length).to.equal(2);

            await factory.connect(funder).fund(delegatee.address, AMOUNT);

            expect((await ethers.provider.getCode(franchiserAddr)).length).to.be.gt(2);
        });

        it("does not redeploy on subsequent fund calls for the same delegatee", async function () {
            const { factory, funder, delegatee, AMOUNT } = await restore();

            await factory.connect(funder).fund(delegatee.address, AMOUNT);

            const codeAfterFirst = await ethers.provider.getCode(
                await factory.getFranchiser(funder.address, delegatee.address)
            );

            // Should not revert; uses existing franchiser
            await factory.connect(funder).fund(delegatee.address, AMOUNT);

            const codeAfterSecond = await ethers.provider.getCode(
                await factory.getFranchiser(funder.address, delegatee.address)
            );

            expect(codeAfterFirst).to.equal(codeAfterSecond);
        });

        it("does increases vote power on subsequent fund calls for the same delegatee", async function () {
            const { factory, funder, delegatee, token, AMOUNT } = await restore();

            await factory.connect(funder).fund(delegatee.address, AMOUNT);
            const votesAfterFirst = await token.getCurrentVotes(delegatee.address);

            await factory.connect(funder).fund(delegatee.address, AMOUNT);
            const votesAfterSecond = await token.getCurrentVotes(delegatee.address);

            expect(votesAfterSecond).to.equal(votesAfterFirst * 2n);
        });

        it("transfers tokens from caller to the franchiser", async function () {
            const { factory, funder, delegatee, token, AMOUNT } = await restore();

            const franchiserAddr = await factory.getFranchiser(funder.address, delegatee.address);

            await expect(
                factory.connect(funder).fund(delegatee.address, AMOUNT)
            ).to.changeTokenBalances(
                ethers,
                token,
                [funder, franchiserAddr],
                [-AMOUNT, AMOUNT]
            );
        });

        it("initializes the franchiser with the correct delegator and delegatee", async function () {
            const { factory, funder, delegatee, AMOUNT } = await restore();

            await factory.connect(funder).fund(delegatee.address, AMOUNT);

            const franchiserAddr = await factory.getFranchiser(funder.address, delegatee.address);
            const franchiser = await ethers.getContractAt("Franchiser", franchiserAddr);

            expect(await franchiser.delegator()).to.equal(funder.address);
            expect(await franchiser.delegatee()).to.equal(delegatee.address);
        });

        it("accumulates tokens on repeated fund calls", async function () {
            const { factory, funder, delegatee, token, AMOUNT } = await restore();

            await factory.connect(funder).fund(delegatee.address, AMOUNT);
            await factory.connect(funder).fund(delegatee.address, AMOUNT);

            const franchiserAddr = await factory.getFranchiser(funder.address, delegatee.address);
            expect(await token.balanceOf(franchiserAddr)).to.equal(AMOUNT * 2n);
        });
    });

    describe("fundMany", function () {
        it("reverts when array lengths differ", async function () {
            const { factory, funder, delegatee } = await restore();

            await expect(
                factory
                    .connect(funder)
                    .fundMany([delegatee.address], [100n, 200n])
            )
                .to.be.revertedWithCustomError(factory, "ArrayLengthMismatch")
                .withArgs(1n, 2n);
        });

        it("funds multiple delegatees in one call", async function () {
            const {
                factory,
                funder,
                delegatee,
                delegatee2,
                token,
                AMOUNT
            } = await restore();

            await factory
                .connect(funder)
                .fundMany([delegatee.address, delegatee2.address], [AMOUNT, AMOUNT]);

            const addr1 = await factory.getFranchiser(funder.address, delegatee.address);
            const addr2 = await factory.getFranchiser(funder.address, delegatee2.address);

            expect(await token.balanceOf(addr1)).to.equal(AMOUNT);
            expect(await token.balanceOf(addr2)).to.equal(AMOUNT);
        });
    });

    describe("recall", function () {
        it("is a no-op when no franchiser exists", async function () {
            const { factory, funder, delegatee, other } = await restore();
            // Should not revert
            await factory.connect(funder).recall(delegatee.address, other.address);
        });

        it("returns all tokens from the franchiser to the recipient", async function () {
            const {
                factory,
                funder,
                delegatee,
                franchiser,
                token,
                AMOUNT
            } = await networkHelpers.loadFixture(fundedFixture);

            await expect(
                factory.connect(funder).recall(delegatee.address, funder.address)
            ).to.changeTokenBalances(
                ethers,
                token,
                [franchiser, funder],
                [-AMOUNT, AMOUNT]
            );
        });

        it("can recall to a different address", async function () {
            const {
                factory,
                funder,
                delegatee,
                other,
                token,
                AMOUNT
            } = await networkHelpers.loadFixture(fundedFixture);

            await expect(
                factory.connect(funder).recall(delegatee.address, other.address)
            ).to.changeTokenBalance(ethers, token, other, AMOUNT);
        });
    });

    describe("recallMany", function () {
        it("reverts when array lengths differ", async function () {
            const { factory, funder, delegatee, other } = await restore();

            await expect(
                factory
                    .connect(funder)
                    .recallMany([delegatee.address], [other.address, funder.address])
            )
                .to.be.revertedWithCustomError(factory, "ArrayLengthMismatch")
                .withArgs(1n, 2n);
        });

        it("recalls from multiple franchisers", async function () {
            const {
                factory,
                funder,
                delegatee,
                delegatee2,
                token,
                AMOUNT
            } = await restore();

            await factory
                .connect(funder)
                .fundMany([delegatee.address, delegatee2.address], [AMOUNT, AMOUNT]);

            const addr1 = await factory.getFranchiser(funder.address, delegatee.address);
            const addr2 = await factory.getFranchiser(funder.address, delegatee2.address);

            await factory
                .connect(funder)
                .recallMany(
                    [delegatee.address, delegatee2.address],
                    [funder.address, funder.address]
                );

            expect(await token.balanceOf(addr1)).to.equal(0n);
            expect(await token.balanceOf(addr2)).to.equal(0n);
        });
    });

    describe("permitAndFund", function () {
        it("funds a franchiser using an EIP-2612 permit signature", async function () {
            const { factory, funder, delegatee, token, AMOUNT } = await restore();

            // Remove any approval so the permit is strictly needed
            await token.connect(funder).approve(await factory.getAddress(), 0n);

            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const factoryAddr = await factory.getAddress();
            const { v, r, s } = await signPermit(funder, token, factoryAddr, AMOUNT, deadline);

            const franchiserAddr = await factory.getFranchiser(funder.address, delegatee.address);

            await expect(
                factory
                    .connect(funder)
                    .permitAndFund(delegatee.address, AMOUNT, deadline, v, r, s)
            ).to.changeTokenBalances(
                ethers,
                token,
                [funder, franchiserAddr],
                [-AMOUNT, AMOUNT]
            );
        });

        it("does not revert if already approved (permit is skipped)", async function () {
            const { factory, funder, delegatee, token, AMOUNT } = await restore();
            // funder already has MaxUint256 approval from fixture

            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const factoryAddr = await factory.getAddress();
            const { v, r, s } = await signPermit(funder, token, factoryAddr, AMOUNT, deadline);

            // Should not revert even though the approval is already in place
            await factory
                .connect(funder)
                .permitAndFund(delegatee.address, AMOUNT, deadline, v, r, s);

            const franchiserAddr = await factory.getFranchiser(funder.address, delegatee.address);

            expect(await token.balanceOf(franchiserAddr)).to.equal(AMOUNT);
        });
    });

    describe("permitAndFundMany", function () {
        it("reverts when array lengths differ", async function () {
            const { factory, funder, delegatee } = await restore();

            const deadline = Math.floor(Date.now() / 1000) + 3600;
            await expect(
                factory
                    .connect(funder)
                    .permitAndFundMany(
                        [delegatee.address],
                        [100n, 200n],
                        deadline,
                        0,
                        ethers.ZeroHash,
                        ethers.ZeroHash
                    )
            )
                .to.be.revertedWithCustomError(factory, "ArrayLengthMismatch")
                .withArgs(1n, 2n);
        });

        it("funds multiple delegatees with a single permit for the total", async function () {
            const {
                factory,
                funder,
                delegatee,
                delegatee2,
                token,
                AMOUNT
            } = await restore();

            await token.connect(funder).approve(await factory.getAddress(), 0n);

            const totalAmount = AMOUNT * 2n;
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const factoryAddr = await factory.getAddress();
            const { v, r, s } = await signPermit(funder, token, factoryAddr, totalAmount, deadline);

            await factory
                .connect(funder)
                .permitAndFundMany(
                    [delegatee.address, delegatee2.address],
                    [AMOUNT, AMOUNT],
                    deadline,
                    v,
                    r,
                    s
                );

            const addr1 = await factory.getFranchiser(funder.address, delegatee.address);
            const addr2 = await factory.getFranchiser(funder.address, delegatee2.address);

            expect(await token.balanceOf(addr1)).to.equal(AMOUNT);
            expect(await token.balanceOf(addr2)).to.equal(AMOUNT);
        });
    });
});
