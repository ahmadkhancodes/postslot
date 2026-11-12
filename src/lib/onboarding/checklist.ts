export interface ChecklistInput {
  forms: number;
  confirmedRecipient: boolean;
  testSubmissions: number;
  realSubmissions: number;
  firstFormId?: string;
}
export interface ChecklistStep { id: "form" | "recipient" | "test" | "install"; title: string; hint: string; done: boolean; href: string }

/** The four steps from sign-up to the first real lead in the inbox (docs/brief.md "Core user flow"). */
export function checklist(i: ChecklistInput): { steps: ChecklistStep[]; done: number; complete: boolean } {
  const form = i.firstFormId ? `/app/forms/${i.firstFormId}` : "/app/forms";
  const steps: ChecklistStep[] = [
    { id: "form", title: "Create a form", hint: "One name, one endpoint URL.", done: i.forms > 0, href: "/app/forms" },
    { id: "recipient", title: "Confirm where mail goes", hint: "Your sign in address is confirmed for you; any other address gets a confirmation link first.", done: i.confirmedRecipient, href: form },
    { id: "test", title: "Send a test submission", hint: "Watch the delivery receipt. Tests do not count toward your limit.", done: i.testSubmissions > 0 || i.realSubmissions > 0, href: i.firstFormId ? `${form}/onboarding` : "/app/forms" },
    { id: "install", title: "Put the form on your site", hint: "Copy the snippet for your stack, then submit it once from your live page.", done: i.realSubmissions > 0, href: i.firstFormId ? `${form}/onboarding` : "/app/forms" },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, complete: done === steps.length };
}
