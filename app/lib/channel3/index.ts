import fs from "node:fs";
import path from "node:path";

export type Candidate = {
  productId: string;
  title: string;
  description: string;
  brand: string | null;
  imageUrl: string | null;
  merchantDomain: string;
  priceCents: number;
  compareAtCents: number | null;
  currency: string;
  offerUrl: string;
  availability?: string;
  categoryTitle: string | null;
  categorySlug: string | null;
  topCategorySlug: string | null; // e.g. "home-garden"
  topCategoryTitle: string | null; // e.g. "Home & Garden"
  categoryPath: string[];
  allOffers: { domain: string; priceCents: number; url: string }[];
};

const cache = new Map<string, Candidate[]>();

function toCents(n: unknown): number | null {
  return typeof n === "number" && isFinite(n) ? Math.round(n * 100) : null;
}

function normalize(p: any): Candidate | null {
  const offer = p?.offers?.[0];
  const priceCents = toCents(offer?.price?.price);
  if (!p?.title || priceCents === null) return null;

  const path0 = p.category?.path?.[0];
  const mainImage =
    p.images?.find((i: any) => i.is_main_image)?.url ?? p.images?.[0]?.url ?? null;

  return {
    productId: String(p.id ?? ""),
    title: p.title,
    description: p.description ?? "",
    brand: p.brands?.[0]?.name ?? null,
    imageUrl: mainImage,
    merchantDomain: offer.domain ?? "unknown",
    priceCents,
    compareAtCents: toCents(offer?.price?.compare_at_price),
    currency: offer.price?.currency ?? "USD",
    offerUrl: offer.url ?? "",
    availability: offer.availability,
    categoryTitle: p.category?.title ?? null,
    categorySlug: p.category?.slug ?? null,
    topCategorySlug: path0?.slug ?? p.category?.slug ?? null,
    topCategoryTitle: path0?.title ?? p.category?.title ?? null,
    categoryPath: (p.category?.path ?? []).map((c: any) => c.slug),
    allOffers: (p.offers ?? [])
      .map((o: any) => ({
        domain: o.domain,
        priceCents: toCents(o.price?.price),
        url: o.url,
      }))
      .filter((o: any) => o.priceCents !== null),
  };
}

export async function searchProducts(query: string, limit = 8): Promise<Candidate[]> {
  const key = `${query}|${limit}`;
  if (cache.has(key)) return cache.get(key)!;

  let products: any[] = [];
  try {
    const res = await fetch("https://api.trychannel3.com/v1/search", {
      method: "POST",
      headers: {
        "x-api-key": process.env.CHANNEL3_API_KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) throw new Error(`Channel3 HTTP ${res.status}`);
    products = (await res.json()).products ?? [];
  } catch (e) {
    console.warn("Channel3 failed, using fixture:", e);
    const fixture = path.join(process.cwd(), "spikes", "channel3-sample.json");
    products = JSON.parse(fs.readFileSync(fixture, "utf8")).products ?? [];
  }

  const result = products.map(normalize).filter((c): c is Candidate => c !== null);
  cache.set(key, result);
  return result;
}