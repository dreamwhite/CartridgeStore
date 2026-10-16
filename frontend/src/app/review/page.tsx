import { ReviewWorkspace } from "../../components/workflow/ReviewWorkspace";
import { ContextualNavigation } from "../../components/layout/ContextualNavigation";

export default function ReviewPage() {
  return <main className="page-gutter grid gap-6 py-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:py-10"><ContextualNavigation context="review" /><div className="min-w-0"><ReviewWorkspace /></div></main>;
}
