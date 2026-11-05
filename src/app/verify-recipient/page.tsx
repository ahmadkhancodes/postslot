import type { Metadata } from "next";
import { VerifyButton } from "./verify-button";

export const metadata: Metadata = { title: "Confirm your address", robots: { index: false, follow: false } };

export default async function VerifyRecipientPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="heading-5 text-text">Confirm this address</h1>
        <p className="body-6 text-text-subtle">Press the button to start receiving form submissions at this address. Nothing is sent to it until you do.</p>
      </div>
      {t ? <VerifyButton token={t} /> : <p role="alert" className="body-6 text-danger">This link is incomplete. Open the link from the email again.</p>}
    </main>
  );
}
