import { api } from "./api";
import { authentication } from "./authentication";
import { billing } from "./billing";
import { deliveryReceipts } from "./delivery-receipts";
import { errors } from "./errors";
import { forms } from "./forms";
import { gettingStarted } from "./getting-started";
import { install } from "./install";
import { limits } from "./limits";
import { sendingDomain } from "./sending-domain";
import { spam } from "./spam";
import { templates } from "./templates";
import type { DocPage } from "./types";
import { webhooks } from "./webhooks";

export type { DocPage, DocSection } from "./types";

export interface DocGroup {
  title: string;
  docs: DocPage[];
}

export const docs: DocPage[] = [gettingStarted, install, forms, spam, deliveryReceipts, templates, sendingDomain, webhooks, api, errors, limits, authentication, billing];

export const docGroups: DocGroup[] = [
  { title: "Start here", docs: [gettingStarted, install, forms] },
  { title: "How it works", docs: [spam, deliveryReceipts, templates, sendingDomain] },
  { title: "Build", docs: [webhooks, api, errors] },
  { title: "Account", docs: [limits, authentication, billing] },
];

export const getDoc = (slug: string): DocPage | undefined => docs.find((d) => d.slug === slug);

export const sectionId = (heading: string): string =>
  heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
