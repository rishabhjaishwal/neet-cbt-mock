import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { InstantLink } from "@/components/InstantLink";
import { CompetitionLobby } from "@/components/CompetitionLobby";

export default async function CompetitionLobbyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "student") redirect("/login");
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) redirect("/competitions");

  return (
    <div className="desk-shell">
      <div className="desk-shell__paper" aria-hidden />
      <div className="desk-shell__inner mx-auto max-w-2xl">
        <p className="text-sm font-semibold text-[var(--ink-blue,#1e4d7b)]">
          <InstantLink href="/competitions" className="hover:underline">
            ← Competitions
          </InstantLink>
        </p>
        <h1 className="desk-title mt-2">Lobby</h1>
        <p className="desk-kicker mb-6">
          Share the invite, wait for friends, then the host starts the same timed
          paper for everyone.
        </p>
        <CompetitionLobby competitionId={id} />
      </div>
    </div>
  );
}
