import { redirect } from "next/navigation";
import { compatibilityDestination, type NextSearchParams } from "../../../lib/compatibility/server";

export default async function LegacyLoginPage({ searchParams }: { searchParams: Promise<NextSearchParams> }) {
  redirect(compatibilityDestination("/login", await searchParams));
}
