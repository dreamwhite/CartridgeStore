import { redirect } from "next/navigation";
import { compatibilityDestination, type NextSearchParams } from "../../../lib/compatibility/server";

export default async function LegacyRegisterPage({ searchParams }: { searchParams: Promise<NextSearchParams> }) {
  redirect(compatibilityDestination("/register", await searchParams));
}
