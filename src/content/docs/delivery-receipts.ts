import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const deliveryReceipts: DocPage = {
  slug: "delivery-receipts",
  title: "Delivery receipts",
  description: `Read the per-submission receipt: what each step means, what Accepted does and does not prove, and what happens on bounces.`,
  sections: [
    {
      heading: "The receipt",
      body: [
        "Open any submission to see its receipt, a timeline with a time stamp for each step: Received (we stored it), Sorted (spam check done), Dispatched (handed to the mail system), then Deferred, Accepted or Returned. The same view is a record you can show a client.",
      ],
    },
    {
      heading: "What Accepted means",
      body: [
        "Accepted means the recipient's mail server took the message. It does not promise the message reached the inbox: the server can still file it as junk, and we cannot see inside a mailbox. If a message was accepted but you cannot find it, check the junk folder and any filtering rules, then Redeliver from the submission.",
      ],
    },
    {
      heading: "Deferred and Returned",
      body: [
        "Deferred means the recipient's server asked us to try later, for example a full mailbox or greylisting. The mail system retries. If nobody accepts within three days, the receipt says expired and the submission becomes Returned.",
        "Returned means the message was refused. A hard bounce (the address does not exist) and a spam complaint add the address to your workspace's suppression list. We stop sending to it, show a banner on the form and email the owner. Fix the address, press Allow again, then Redeliver.",
      ],
    },
    {
      heading: "Held submissions",
      body: [
        `Two things hold a submission instead of sending it. Over the monthly limit: it is stored, labelled Held over limit and released when you upgrade or the month resets. No confirmed recipient: it is labelled Held, address unconfirmed and sent once an address is confirmed. Held submissions are never dropped and never purged while held.`,
      ],
    },
    {
      heading: "Retries",
      body: [
        "If handing a message to the mail system fails, we retry after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours. After that the receipt records that we gave up and the submission shows Returned. Redeliver starts it again.",
      ],
    },
    {
      heading: "Who sends the mail",
      body: [
        `Notification emails are sent through a transactional email provider (listed on the sub-processors page). ${p.name} does not run its own mail servers today, and this page will say so when that changes.`,
      ],
    },
  ],
};
