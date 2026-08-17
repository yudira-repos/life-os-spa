export function AdultsOnly() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <p className="text-4xl">🔐</p>
      <p className="text-lg font-semibold">FinancialOS is limited to adults in this household.</p>
      <p className="text-sm text-neutral-400">
        Bank balances, income, and transaction history aren&apos;t household-wide
        information the way a shared calendar is. Only members with the OWNER or
        ADULT role can open this module.
      </p>
      <p className="text-xs text-neutral-600">
        Checked on the server before any data is read — not hidden in the menu.
        The attempt was recorded in the household&apos;s financial audit log.
      </p>
    </div>
  );
}
