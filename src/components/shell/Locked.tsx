import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Locked({ moduleName }: { moduleName: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <p className="text-4xl">🔒</p>
      <p className="text-lg font-semibold">{moduleName} isn&apos;t included in your plan yet.</p>
      <p className="text-sm text-neutral-400">
        This is checked on the server, not just hidden in the menu — so this
        page really is gated, not just tucked away.
      </p>
      <Link href="/subscription">
        <Button>See plans</Button>
      </Link>
    </div>
  );
}
