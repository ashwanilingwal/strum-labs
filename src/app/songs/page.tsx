import { SongPlayer } from "@/components/SongPlayer";
import { SONGS } from "@/lib/music/songs";

export const metadata = { title: "Songs · StrumLab" };

export default function Page() {
  // One song for now; this page becomes a picker the day there are two.
  return <SongPlayer song={SONGS[0]} />;
}
