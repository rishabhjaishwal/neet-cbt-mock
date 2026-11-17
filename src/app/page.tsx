import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LandingHero } from "@/components/LandingHero";

export default async function HomePage() {
  const user = await getSession();
  if (user) {
    redirect(user.role === "examiner" ? "/examiner" : "/dashboard");
  }

  return <LandingHero />;
}
