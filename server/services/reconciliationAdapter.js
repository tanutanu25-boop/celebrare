/**
 * Optional Bank Statement / Official Bank API Reconciliation Adapter.
 *
 * IMPORTANT ARCHITECTURE NOTE:
 * Email authentication (SPF/DKIM/DMARC) + Cloudflare Email Worker HMAC only verify
 * that an email arrived from an expected mail domain and passed through our worker.
 * It is NOT equivalent to a live cryptographic bank settlement confirmation.
 *
 * In production, configure a real bank statement feed, NPCI/PSP reconciliation webhook,
 * or account-aggregator adapter implementing `reconcileTransaction(...)`.
 */
export class BaseBankReconciliationAdapter {
  isConfigured() {
    return false;
  }

  getProviderName() {
    return "none";
  }

  async reconcileTransaction() {
    return {
      configured: false,
      verifiedByBankFeed: false,
      status: "NOT_CONFIGURED",
      message:
        "No live bank API/statement feed configured; relying on email-trust rules and admin review.",
    };
  }
}

export class NullBankReconciliationAdapter extends BaseBankReconciliationAdapter {}

export function getBankReconciliationAdapter() {
  // Future production adapters can be selected via process.env.BANK_RECONCILIATION_PROVIDER
  return new NullBankReconciliationAdapter();
}
