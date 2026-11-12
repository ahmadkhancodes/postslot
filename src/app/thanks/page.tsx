import type { Metadata } from "next";
import { Postmark } from "@/components/marketing/demo/postmark";

export const metadata: Metadata = { title: "Thank you", robots: { index: false, follow: false } };

/** Default landing page for HTML form posts when the form has no success URL of its own. */
export default function ThanksPage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-6 px-6 py-16">
      <Postmark label="RECEIVED" time="Sent" date="THANK YOU" className="size-24" />
      <div className="flex flex-col gap-2">
        <h1 className="heading-5 text-text">Thank you, your message was sent</h1>
        <p className="body-6 text-text-subtle">The site owner has it and will reply to the address you gave, if you gave one.</p>
      </div>
      <p className="caption-5 text-text-muted">You can close this tab or use your browser&apos;s back button.</p>
    </main>
  );
}
