"use client";
import { ButtonLink } from "@/components/ui/button";
import { useCta } from "@/lib/marketing-session";

type Props = Omit<React.ComponentProps<typeof ButtonLink>, "children" | "href"> & { href: string; label: string };

/** Marketing call to action: the given label signed out, "Open app" signed in. Server HTML is the signed-out one. */
export function SessionCta({ href, label, ...rest }: Props) {
  const cta = useCta({ href, label });
  return <ButtonLink {...rest} href={cta.href}>{cta.label}</ButtonLink>;
}
