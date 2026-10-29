import { searchProducts } from "../lib/channel3";

async function main() {
  for (const q of ["warm fleece blanket", "reading glasses", "kitchen knife set", "paperback mystery novel", "gift card"]) {
    const r = await searchProducts(q, 4);
    console.log(`\n== ${q} (${r.length})`);
    console.log(
      r.map((c) => ({
        t: c.title.slice(0, 40),
        $: c.priceCents / 100,
        m: c.merchantDomain,
        top: c.topCategorySlug,
        cat: c.categorySlug,
      }))
    );
  }
}
main();