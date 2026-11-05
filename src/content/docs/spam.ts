import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const spam: DocPage = {
  slug: "spam",
  title: "Spam filtering",
  description: `The layers ${p.name} uses to stop spam, how spam is counted, and how to tune and train it.`,
  sections: [
    {
      heading: "Spam never counts",
      body: [
        "Submissions caught as spam are kept in the Spam tab of your inbox, never emailed and never counted toward your monthly limit. A spam flood cannot use up your plan or push real messages into the held queue.",
      ],
    },
    {
      heading: "The layers",
      body: [
        "Each submission goes through the layers in order. Cheap checks run first.",
        "Rate limits: at most 5 posts a minute per visitor and 120 a minute per form. Over that, the endpoint answers 429. We store a salted hash of the IP, not the address.",
        "Honeypot: a hidden field named _gotcha or botcheck. A person never fills it, a bot usually does. A filled honeypot is spam straight away.",
        "Time token: add the one line script tag from the form page. It signs the time the page loaded, so posts that arrive impossibly fast score higher.",
        "Proof of work (ALTCHA): optional, per form, off by default. It makes the visitor's browser do a small calculation. There is no puzzle to solve, no tracking and no third party. Add the open source ALTCHA widget inside your form with challengeurl set to https://postslot.buffersoltech.com/api/altcha first, then turn the check on in the form settings: with the check on, a post without a solved widget is rejected with captcha_failed.",
        "Content rules: more links than allowed (default 2), blocked phrases you set, scripts and iframes in the text, and disposable email domains. Each rule adds a weight to the score.",
        "Learning filter: a Bayesian filter that learns from your Mark spam and Not spam clicks, per workspace.",
      ],
    },
    {
      heading: "Scores, modes and the threshold",
      body: [
        "The weights combine into a score from 0 to 1. At or above the form's threshold (default 0.7, adjustable from 0.3 to 0.95) the submission is spam. Mode Standard uses all layers, Strict caps the threshold at 0.5, so borderline posts are caught. Off skips content scoring, though the edge layers (rate limits, honeypot, time token) still run.",
        "Open a submission to see the signals that fired and their weights. Submissions that skipped content scoring say unscored.",
      ],
    },
    {
      heading: "Not spam and Mark spam",
      body: [
        "Not spam releases a submission from quarantine, sends it to your recipients, adds the sender to the form's allowed senders and teaches the filter. Mark spam moves a delivered one the other way and teaches the filter. Allowed senders skip content scoring but not the rate limits or the honeypot.",
      ],
    },
    {
      heading: "Burst alert",
      body: [
        "If 20 or more spam submissions arrive within 10 minutes, the workspace owner gets one email, at most once an hour, with a link to tighten the rules.",
      ],
    },
  ],
};
