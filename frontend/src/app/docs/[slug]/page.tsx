import { notFound } from "next/navigation";

import { DocumentationArticle } from "../../../components/docs/DocumentationArticle";
import { documentation, getDocumentationArticle } from "../../../lib/docs/content";

export function generateStaticParams() {
  return documentation.map((article) => ({ slug: article.slug }));
}

export default async function DocumentationArticleRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getDocumentationArticle(slug);
  if (!article) notFound();
  return <DocumentationArticle article={article} />;
}
