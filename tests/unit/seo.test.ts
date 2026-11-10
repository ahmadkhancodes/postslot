import { describe, expect, it } from "vitest";
import { pageMetadata } from "@/lib/seo";
import { product } from "@/config/product";

describe("page metadata", () => {
  it("emits og:image and twitter:image as absolute URLs to the product opengraph-image route", () => {
    const m = pageMetadata({ title: "Docs", description: "d", path: "/docs" });
    const want = new URL("/opengraph-image", product.url).toString();
    expect(m.openGraph?.images).toEqual([want]);
    expect(m.twitter?.images).toEqual([want]);
  });
});
