import { redirect } from "next/navigation";

import { Homepage } from "../components/homepage/Homepage";
import { exploreRedirectPath, type PageSearchParams } from "../lib/navigation/catalog-compat";

export default async function HomePage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const legacyCatalogPath = exploreRedirectPath(await searchParams);
  if (legacyCatalogPath) redirect(legacyCatalogPath);

  return <Homepage />;
}
