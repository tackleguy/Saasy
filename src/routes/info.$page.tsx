import { createFileRoute, notFound } from "@tanstack/react-router";
import { SizeTable } from "@/components/size-table";

const pages: Record<string, { title: string; body: string }> = {
  about: { title: "About Us", body: "The Conservation Collective makes elevated outdoor essentials — built for the trail, worn everywhere." },
  contact: { title: "Contact", body: "Contact details will be added soon." },
  "shipping-returns": { title: "Shipping & Returns", body: "Shipping rates, delivery times and our returns policy will be published before launch." },
  "size-guide": { title: "Size Guide", body: "Our tees, hoodies and sweatpants are cut with a relaxed, oversized fit." },
  faq: { title: "FAQ", body: "Answers to common questions will be posted here before launch." },
  privacy: { title: "Privacy Policy", body: "Our privacy policy is being finalized and will be published here." },
  terms: { title: "Terms of Service", body: "Our terms of service are being finalized and will be published here." },
};

export const Route = createFileRoute("/info/$page")({
  loader: ({ params }) => {
    const page = pages[params.page];
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.title} — The Conservation Collective` : "Page not found";
    return { meta: [{ title: t }, { name: "description", content: loaderData?.body ?? "" }, { property: "og:title", content: t }, { property: "og:description", content: loaderData?.body ?? "" }] };
  },
  component: Info,
});

function Info() {
  const { page } = Route.useParams();
  const data = Route.useLoaderData();
  return (
    <div className="mx-auto max-w-2xl px-5 py-20">
      <h1 className="text-4xl font-black uppercase tracking-tight md:text-5xl">{data.title}</h1>
      <p className="mt-6 leading-relaxed text-muted-foreground">{data.body}</p>
      {page === "size-guide" && <div className="mt-8"><SizeTable /></div>}
    </div>
  );
}
