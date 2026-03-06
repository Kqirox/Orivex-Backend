/**
 * stellar.service.ts
 *
 * Service layer for all Stellar blockchain interactions.
 * Built for @stellar/stellar-sdk v12+ (the modern package — NOT the old "stellar-sdk").
 *
 * Install:
 *   npm install @stellar/stellar-sdk
 *
 * Env vars expected:
 *   STELLAR_NETWORK=testnet | mainnet   (default: testnet)
 *   SOROBAN_CONTRACT_ID=C...            (your deployed credential contract)
 */

import {
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  Asset,
  Operation,
  Memo,
  BASE_FEE,
  xdr,
  nativeToScVal,
  scValToNative,
  Contract,
  Address,
} from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StellarWallet {
  publicKey: string;
  secretKey: string;
}

export interface AccountBalance {
  asset: string;
  balance: string;
  limit?: string;
}

export interface PaymentOptions {
  sourceSecret: string;
  destinationPublicKey: string;
  amount: string;
  asset?: Asset;          // defaults to XLM
  memo?: string;
}

export interface PaymentResult {
  hash: string;
  ledger: number;
  successful: boolean;
}

export interface CredentialData {
  recipientPublicKey: string;
  credentialType: string;
  data: Record<string, unknown>;
  expiresAt?: number; // Unix timestamp
}

export interface CredentialResult {
  contractId: string;
  transactionHash: string;
  credentialId: string;
}

export interface VerificationResult {
  isValid: boolean;
  credentialId: string;
  issuer: string;
  recipient: string;
  credentialType: string;
  issuedAt: number;
  expiresAt?: number;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Network configuration
// ---------------------------------------------------------------------------

type NetworkName = "testnet" | "mainnet";

const NETWORK_CONFIG: Record<
  NetworkName,
  { networkPassphrase: string; rpcUrl: string; horizonUrl: string }
> = {
  testnet: {
    networkPassphrase: Networks.TESTNET,
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
  },
  mainnet: {
    networkPassphrase: Networks.PUBLIC,
    rpcUrl: "https://mainnet.stellar.validationcloud.io/v1/[your-key]",
    horizonUrl: "https://horizon.stellar.org",
  },
};

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class StellarServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "StellarServiceError";
  }
}

// ---------------------------------------------------------------------------
// StellarService
// ---------------------------------------------------------------------------

export class StellarService {
  private readonly server: SorobanRpc.Server;
  private readonly networkPassphrase: string;
  private readonly contractId: string;
  private readonly network: NetworkName;

  constructor(
    network: NetworkName = (process.env.STELLAR_NETWORK as NetworkName) ??
      "testnet",
    contractId: string = process.env.SOROBAN_CONTRACT_ID ?? ""
  ) {
    this.network = network;
    const config = NETWORK_CONFIG[network];
    this.networkPassphrase = config.networkPassphrase;
    this.contractId = contractId;

    this.server = new SorobanRpc.Server(config.rpcUrl, {
      allowHttp: network === "testnet",
    });
  }

  // -------------------------------------------------------------------------
  // Wallet generation
  // -------------------------------------------------------------------------

  /**
   * Generates a brand-new Stellar keypair.
   * On testnet you can fund it immediately with friendbot.
   */
  generateWallet(): StellarWallet {
    try {
      const keypair = Keypair.random();
      return {
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret(),
      };
    } catch (err) {
      throw new StellarServiceError(
        "Failed to generate Stellar wallet",
        "WALLET_GENERATION_ERROR",
        err
      );
    }
  }

  /**
   * Fund a testnet account via Friendbot (testnet only).
   */
  async fundTestnetAccount(publicKey: string): Promise<void> {
    if (this.network !== "testnet") {
      throw new StellarServiceError(
        "Friendbot is only available on testnet",
        "INVALID_NETWORK"
      );
    }
    try {
      const res = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}` 
      );
      if (!res.ok) {
        throw new Error(`Friendbot returned ${res.status}`);
      }
    } catch (err) {
      throw new StellarServiceError(
        "Failed to fund testnet account via Friendbot",
        "FRIENDBOT_ERROR",
        err
      );
    }
  }

  // -------------------------------------------------------------------------
  // Balance
  // -------------------------------------------------------------------------

  /**
   * Returns all balances (XLM + any trustlines) for an account.
   */
  async getBalances(publicKey: string): Promise<AccountBalance[]> {
    try {
      const account = await this.server.getAccount(publicKey);
      return account.balances.map((b) => {
        const assetName =
          b.asset_type === "native"
            ? "XLM"
            : `${(b as { asset_code: string }).asset_code}:${
                (b as { asset_issuer: string }).asset_issuer
              }`;
        return {
          asset: assetName,
          balance: b.balance,
          limit:
            b.asset_type !== "native"
              ? (b as { limit: string }).limit
              : undefined,
        };
      });
    } catch (err) {
      throw new StellarServiceError(
        `Failed to fetch balances for ${publicKey}`,
        "BALANCE_FETCH_ERROR",
        err
      );
    }
  }

  /**
   * Returns the native XLM balance as a plain string.
   */
  async getNativeBalance(publicKey: string): Promise<string> {
    const balances = await this.getBalances(publicKey);
    const native = balances.find((b) => b.asset === "XLM");
    return native?.balance ?? "0";
  }

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------

  /**
   * Send a payment on Stellar.
   * Handles both native XLM and any custom asset.
   */
  async sendPaymentWithOptions(options: PaymentOptions): Promise<PaymentResult> {
    const { sourceSecret, destinationPublicKey, amount, memo } = options;
    const asset = options.asset ?? Asset.native();

    try {
      const sourceKeypair = Keypair.fromSecret(sourceSecret);
      const sourcePublicKey = sourceKeypair.publicKey();

      // Load source account (needed for sequence number)
      const sourceAccount = await this.server.getAccount(sourcePublicKey);

      // Make sure destination exists (create it if sending XLM and it doesn't exist)
      let destinationExists = true;
      try {
        await this.server.getAccount(destinationPublicKey);
      } catch {
        destinationExists = false;
      }

      const builder = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      if (!destinationExists && asset === Asset.native()) {
        // createAccount instead of payment when account doesn't exist
        builder.addOperation(
          Operation.createAccount({
            destination: destinationPublicKey,
            startingBalance: amount,
          })
        );
      } else {
        builder.addOperation(
          Operation.payment({
            destination: destinationPublicKey,
            asset,
            amount,
          })
        );
      }

      if (memo) {
        builder.addMemo(Memo.text(memo));
      }

      const transaction = builder.setTimeout(30).build();
      transaction.sign(sourceKeypair);

      const response = await this.server.sendTransaction(transaction);

      if (response.status === "ERROR") {
        throw new Error(
          `Transaction failed: ${JSON.stringify(response.errorResult)}` 
        );
      }

      // Poll for confirmation
      const confirmed = await this.waitForTransaction(response.hash);

      return {
        hash: response.hash,
        ledger: confirmed.ledger,
        successful: confirmed.status === "SUCCESS",
      };
    } catch (err) {
      if (err instanceof StellarServiceError) throw err;
      throw new StellarServiceError(
        "Payment transaction failed",
        "PAYMENT_ERROR",
        err
      );
    }
  }

  // -------------------------------------------------------------------------
  // Soroban credential issuance
  // -------------------------------------------------------------------------

  /**
   * Issues a credential on a Soroban smart contract.
   * The contract must expose an `issue_credential` function.
   */
  async issueCredential(
    issuerSecret: string,
    credential: CredentialData
  ): Promise<CredentialResult> {
    if (!this.contractId) {
      throw new StellarServiceError(
        "No Soroban contract ID configured",
        "CONTRACT_NOT_CONFIGURED"
      );
    }

    try {
      const issuerKeypair = Keypair.fromSecret(issuerSecret);
      const issuerAccount = await this.server.getAccount(
        issuerKeypair.publicKey()
      );

      const contract = new Contract(this.contractId);

      // Build Soroban args — adjust to match your actual contract ABI
      const args = [
        nativeToScVal(credential.recipientPublicKey, { type: "address" }),
        nativeToScVal(credential.credentialType, { type: "string" }),
        nativeToScVal(JSON.stringify(credential.data), { type: "string" }),
        nativeToScVal(credential.expiresAt ?? 0, { type: "u64" }),
      ];

      const operation = contract.call("issue_credential", ...args);

      const transaction = new TransactionBuilder(issuerAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      // Simulate first (required for Soroban)
      const simResult = await this.server.simulateTransaction(transaction);

      if (SorobanRpc.Api.isSimulationError(simResult)) {
        throw new Error(`Simulation failed: ${simResult.error}`);
      }

      // Assemble the transaction with the simulation footprint
      const assembledTx = SorobanRpc.assembleTransaction(
        transaction,
        simResult
      ).build();

      assembledTx.sign(issuerKeypair);

      const sendResult = await this.server.sendTransaction(assembledTx);
      const confirmed = await this.waitForTransaction(sendResult.hash);

      // Extract return value (credentialId) from the result
      const credentialId = this.extractReturnValue(confirmed);

      return {
        contractId: this.contractId,
        transactionHash: sendResult.hash,
        credentialId,
      };
    } catch (err) {
      if (err instanceof StellarServiceError) throw err;
      throw new StellarServiceError(
        "Credential issuance failed",
        "CREDENTIAL_ISSUANCE_ERROR",
        err
      );
    }
  }

  // -------------------------------------------------------------------------
  // Soroban credential verification
  // -------------------------------------------------------------------------

  /**
   * Verifies a credential by calling the contract's `verify_credential` view function.
   */
  async verifyCredential(credentialId: string): Promise<VerificationResult> {
    if (!this.contractId) {
      throw new StellarServiceError(
        "No Soroban contract ID configured",
        "CONTRACT_NOT_CONFIGURED"
      );
    }

    try {
      const contract = new Contract(this.contractId);
      const args = [nativeToScVal(credentialId, { type: "string" })];
      const operation = contract.call("verify_credential", ...args);

      // For read-only calls we simulate without signing
      const dummyAccount = await this.server.getAccount(
        // Use a well-known testnet account for simulation if no source available
        "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
      );

      const tx = new TransactionBuilder(dummyAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      const simResult = await this.server.simulateTransaction(tx);

      if (SorobanRpc.Api.isSimulationError(simResult)) {
        throw new Error(`Verification simulation failed: ${simResult.error}`);
      }

      // Parse the return value
      const returnVal =
        SorobanRpc.Api.isSimulationSuccess(simResult) && simResult.result
          ? scValToNative(simResult.result.retval)
          : null;

      if (!returnVal) {
        return {
          isValid: false,
          credentialId,
          issuer: "",
          recipient: "",
          credentialType: "",
          issuedAt: 0,
          data: {},
        };
      }

      const parsed = returnVal as Record<string, unknown>;
      return {
        isValid: true,
        credentialId,
        issuer: String(parsed.issuer ?? ""),
        recipient: String(parsed.recipient ?? ""),
        credentialType: String(parsed.credential_type ?? ""),
        issuedAt: Number(parsed.issued_at ?? 0),
        expiresAt: parsed.expires_at ? Number(parsed.expires_at) : undefined,
        data: parsed.data
          ? JSON.parse(String(parsed.data))
          : {},
      };
    } catch (err) {
      if (err instanceof StellarServiceError) throw err;
      throw new StellarServiceError(
        "Credential verification failed",
        "CREDENTIAL_VERIFICATION_ERROR",
        err
      );
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async waitForTransaction(
    hash: string,
    maxAttempts = 20,
    intervalMs = 2000
  ): Promise<SorobanRpc.Api.GetTransactionResponse> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const result = await this.server.getTransaction(hash);

      if (result.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
        return result;
      }
    }
    throw new StellarServiceError(
      `Transaction ${hash} not confirmed after ${maxAttempts} attempts`,
      "TRANSACTION_TIMEOUT"
    );
  }

  private extractReturnValue(
    txResult: SorobanRpc.Api.GetTransactionResponse
  ): string {
    try {
      if (
        txResult.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS &&
        txResult.returnValue
      ) {
        const native = scValToNative(txResult.returnValue);
        return String(native);
      }
    } catch {
      // fall through
    }
    return `cred_${Date.now()}`;
  }

  // -------------------------------------------------------------------------
  // Existing interface methods (for backward compatibility)
  // -------------------------------------------------------------------------

  /**
   * Send an XLM payment to `destinationAddress`.
   * Returns the transaction hash on success.
   */
  async sendPayment(
    destinationAddress: string,
    amount: number,
    memo: string,
  ): Promise<string> {
    // This method is kept for backward compatibility
    throw new Error(
      `Legacy sendPayment not implemented. Use sendPaymentWithOptions() with PaymentOptions instead.`
    );
  }

  /**
   * Look up the wallet address stored for a given user.
   * Returns undefined when the user has no wallet on record.
   */
  async getWalletAddress(userId: string): Promise<string | undefined> {
    // Production: query the database for user.walletAddress
    throw new Error(
      `StellarService.getWalletAddress not implemented for user "${userId}"`,
    );
  }

  /**
   * Verify that a transaction hash exists and is confirmed on the network.
   */
  async verifyTransaction(txHash: string): Promise<boolean> {
    try {
      const result = await this.server.getTransaction(txHash);
      return result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS;
    } catch (err) {
      throw new StellarServiceError(
        `Failed to verify transaction ${txHash}`,
        "TRANSACTION_VERIFICATION_ERROR",
        err
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export (use this in the rest of your app)
// ---------------------------------------------------------------------------

export const stellarService = new StellarService();
