/**
 * stellar.service.test.ts
 *
 * Unit tests for StellarService.
 * Uses Vitest + manual mocks — no real network calls.
 *
 * Run: npm test stellar.service.test.ts
 */

import { describe, it, expect, jest, beforeEach } from "vitest";
import { StellarService, StellarServiceError } from "./stellar.service";

// ---------------------------------------------------------------------------
// Mock @stellar/stellar-sdk
// ---------------------------------------------------------------------------

const mockGetAccount = jest.fn();
const mockSendTransaction = jest.fn();
const mockSimulateTransaction = jest.fn();
const mockGetTransaction = jest.fn();

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");

  return {
    ...actual,
    SorobanRpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: mockGetAccount,
        sendTransaction: mockSendTransaction,
        simulateTransaction: mockSimulateTransaction,
        getTransaction: mockGetTransaction,
      })),
      Api: {
        ...actual.SorobanRpc?.Api,
        isSimulationError: jest.fn((r: unknown) =>
          Boolean(r && typeof r === "object" && "error" in (r as object))
        ),
        isSimulationSuccess: jest.fn((r: unknown) =>
          Boolean(r && typeof r === "object" && !("error" in (r as object)))
        ),
        GetTransactionStatus: {
          SUCCESS: "SUCCESS",
          FAILED: "FAILED",
          NOT_FOUND: "NOT_FOUND",
        },
      },
      assembleTransaction: jest.fn((tx: unknown) => ({
        build: jest.fn().mockReturnValue({
          sign: jest.fn(),
          ...tx,
        }),
      })),
    },
    nativeToScVal: jest.fn((v: unknown) => ({ type: "scVal", value: v })),
    scValToNative: jest.fn((v: unknown) => v),
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn().mockReturnValue("mock_operation"),
    })),
  };
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("StellarService", () => {
  let service: StellarService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StellarService("testnet", "CTEST_CONTRACT_ID");
  });

  // -------------------------------------------------------------------------
  // Wallet generation
  // -------------------------------------------------------------------------

  describe("generateWallet()", () => {
    it("returns a valid public/secret key pair", () => {
      const wallet = service.generateWallet();
      expect(wallet.publicKey).toMatch(/^G[A-Z2-7]{55}$/);
      expect(wallet.secretKey).toMatch(/^S[A-Z2-7]{55}$/);
    });

    it("each call returns a unique keypair", () => {
      const a = service.generateWallet();
      const b = service.generateWallet();
      expect(a.publicKey).not.toBe(b.publicKey);
      expect(a.secretKey).not.toBe(b.secretKey);
    });
  });

  // -------------------------------------------------------------------------
  // Friendbot
  // -------------------------------------------------------------------------

  describe("fundTestnetAccount()", () => {
    it("throws on mainnet", async () => {
      const mainnetService = new StellarService("mainnet");
      await expect(
        mainnetService.fundTestnetAccount("GABC...")
      ).rejects.toThrow(StellarServiceError);
    });

    it("calls friendbot URL with the correct address", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      const { publicKey } = service.generateWallet();
      await service.fundTestnetAccount(publicKey);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(publicKey))
      );
    });
  });

  // -------------------------------------------------------------------------
  // Balance checks
  // -------------------------------------------------------------------------

  describe("getBalances()", () => {
    it("returns XLM balance from native asset", async () => {
      mockGetAccount.mockResolvedValue({
        balances: [{ asset_type: "native", balance: "100.0000000" }],
      });

      const balances = await service.getBalances("GPUBKEY...");
      expect(balances).toHaveLength(1);
      expect(balances[0].asset).toBe("XLM");
      expect(balances[0].balance).toBe("100.0000000");
    });

    it("includes custom asset trustlines", async () => {
      mockGetAccount.mockResolvedValue({
        balances: [
          { asset_type: "native", balance: "50.0000000" },
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: "GCISSUER...",
            balance: "200.0000000",
            limit: "1000.0000000",
          },
        ],
      });

      const balances = await service.getBalances("GPUBKEY...");
      expect(balances).toHaveLength(2);
      expect(balances[1].asset).toBe("USDC:GCISSUER...");
      expect(balances[1].limit).toBe("1000.0000000");
    });

    it("throws StellarServiceError on network failure", async () => {
      mockGetAccount.mockRejectedValue(new Error("Network error"));
      await expect(service.getBalances("GPUBKEY...")).rejects.toThrow(
        StellarServiceError
      );
    });
  });

  describe("getNativeBalance()", () => {
    it("returns just the XLM balance string", async () => {
      mockGetAccount.mockResolvedValue({
        balances: [{ asset_type: "native", balance: "42.0000000" }],
      });
      const bal = await service.getNativeBalance("GPUBKEY...");
      expect(bal).toBe("42.0000000");
    });

    it("returns '0' when no native balance found", async () => {
      mockGetAccount.mockResolvedValue({ balances: [] });
      const bal = await service.getNativeBalance("GPUBKEY...");
      expect(bal).toBe("0");
    });
  });

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------

  describe("sendPaymentWithOptions()", () => {
    const { Keypair } = jest.requireActual("@stellar/stellar-sdk");
    const sourceKeypair = Keypair.random();

    beforeEach(() => {
      // Source exists
      mockGetAccount.mockImplementation((pk: string) => {
        if (pk === sourceKeypair.publicKey()) {
          return Promise.resolve({
            id: pk,
            sequence: "1234",
            balances: [{ asset_type: "native", balance: "1000.0000000" }],
            incrementSequenceNumber: jest.fn(),
          });
        }
        // Destination exists
        return Promise.resolve({ id: pk, sequence: "0", balances: [], incrementSequenceNumber: jest.fn() });
      });

      mockSendTransaction.mockResolvedValue({
        status: "PENDING",
        hash: "TXHASH123",
      });

      mockGetTransaction.mockResolvedValue({
        status: "SUCCESS",
        ledger: 999,
        returnValue: null,
      });
    });

    it("returns a successful payment result", async () => {
      const result = await service.sendPaymentWithOptions({
        sourceSecret: sourceKeypair.secret(),
        destinationPublicKey: Keypair.random().publicKey(),
        amount: "10",
      });

      expect(result.hash).toBe("TXHASH123");
      expect(result.successful).toBe(true);
      expect(result.ledger).toBe(999);
    });

    it("throws StellarServiceError when transaction errors", async () => {
      mockSendTransaction.mockResolvedValue({
        status: "ERROR",
        errorResult: { msg: "bad sequence" },
        hash: "BADSEND",
      });

      await expect(
        service.sendPaymentWithOptions({
          sourceSecret: sourceKeypair.secret(),
          destinationPublicKey: Keypair.random().publicKey(),
          amount: "10",
        })
      ).rejects.toThrow(StellarServiceError);
    });
  });

  // -------------------------------------------------------------------------
  // Credential issuance
  // -------------------------------------------------------------------------

  describe("issueCredential()", () => {
    const { Keypair } = jest.requireActual("@stellar/stellar-sdk");
    const issuerKeypair = Keypair.random();

    beforeEach(() => {
      mockGetAccount.mockResolvedValue({
        id: issuerKeypair.publicKey(),
        sequence: "5678",
        balances: [],
        incrementSequenceNumber: jest.fn(),
      });

      mockSimulateTransaction.mockResolvedValue({
        result: { retval: { type: "scVal", value: "CRED_001" } },
        transactionData: "mock_footprint",
        minResourceFee: "100",
      });

      mockSendTransaction.mockResolvedValue({
        status: "PENDING",
        hash: "CREDHASH456",
      });

      mockGetTransaction.mockResolvedValue({
        status: "SUCCESS",
        ledger: 1001,
        returnValue: { type: "scVal", value: "CRED_001" },
      });
    });

    it("issues a credential and returns result", async () => {
      const result = await service.issueCredential(issuerKeypair.secret(), {
        recipientPublicKey: Keypair.random().publicKey(),
        credentialType: "DEGREE",
        data: { institution: "MIT", degree: "BSc" },
        expiresAt: 9999999999,
      });

      expect(result.transactionHash).toBe("CREDHASH456");
      expect(result.contractId).toBe("CTEST_CONTRACT_ID");
      expect(result.credentialId).toBeDefined();
    });

    it("throws if no contract ID is configured", async () => {
      const noContractService = new StellarService("testnet", "");
      await expect(
        noContractService.issueCredential(issuerKeypair.secret(), {
          recipientPublicKey: "GDEST...",
          credentialType: "ID",
          data: {},
        })
      ).rejects.toThrow(StellarServiceError);
    });

    it("throws when simulation returns an error", async () => {
      mockSimulateTransaction.mockResolvedValue({ error: "contract panic" });

      await expect(
        service.issueCredential(issuerKeypair.secret(), {
          recipientPublicKey: Keypair.random().publicKey(),
          credentialType: "ID",
          data: {},
        })
      ).rejects.toThrow(StellarServiceError);
    });
  });

  // -------------------------------------------------------------------------
  // Credential verification
  // -------------------------------------------------------------------------

  describe("verifyCredential()", () => {
    beforeEach(() => {
      mockGetAccount.mockResolvedValue({
        id: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
        sequence: "0",
        balances: [],
        incrementSequenceNumber: jest.fn(),
      });
    });

    it("returns valid credential data when simulation succeeds", async () => {
      const mockCredData = {
        issuer: "GISSUER...",
        recipient: "GRECIPIENT...",
        credential_type: "DEGREE",
        issued_at: 1700000000,
        expires_at: 9999999999,
        data: JSON.stringify({ degree: "BSc" }),
      };

      mockSimulateTransaction.mockResolvedValue({
        result: { retval: mockCredData },
      });

      // Override scValToNative to return our mock data
      const sdk = require("@stellar/stellar-sdk");
      sdk.scValToNative.mockReturnValue(mockCredData);

      const result = await service.verifyCredential("CRED_001");
      expect(result.isValid).toBe(true);
      expect(result.credentialType).toBe("DEGREE");
    });

    it("returns isValid=false when simulation returns null", async () => {
      mockSimulateTransaction.mockResolvedValue({
        result: { retval: null },
      });

      const sdk = require("@stellar/stellar-sdk");
      sdk.scValToNative.mockReturnValue(null);

      const result = await service.verifyCredential("MISSING_CRED");
      expect(result.isValid).toBe(false);
    });

    it("throws StellarServiceError on simulation failure", async () => {
      mockSimulateTransaction.mockResolvedValue({
        error: "contract not found",
      });

      await expect(service.verifyCredential("BAD_ID")).rejects.toThrow(
        StellarServiceError
      );
    });
  });

  // -------------------------------------------------------------------------
  // Transaction verification
  // -------------------------------------------------------------------------

  describe("verifyTransaction()", () => {
    it("returns true for successful transaction", async () => {
      const sdk = require("@stellar/stellar-sdk");
      mockGetTransaction.mockResolvedValue({
        status: sdk.SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        ledger: 123,
      });

      const result = await service.verifyTransaction("TX_HASH");
      expect(result).toBe(true);
    });

    it("returns false for failed transaction", async () => {
      const sdk = require("@stellar/stellar-sdk");
      mockGetTransaction.mockResolvedValue({
        status: sdk.SorobanRpc.Api.GetTransactionStatus.FAILED,
        ledger: 123,
      });

      const result = await service.verifyTransaction("TX_HASH");
      expect(result).toBe(false);
    });

    it("throws StellarServiceError on network error", async () => {
      mockGetTransaction.mockRejectedValue(new Error("Network error"));
      await expect(service.verifyTransaction("TX_HASH")).rejects.toThrow(
        StellarServiceError
      );
    });
  });
});
