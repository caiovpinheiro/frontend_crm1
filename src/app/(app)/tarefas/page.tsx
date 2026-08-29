import { redirect } from "next/navigation";

/** Alias legado: a nav antiga apontava para o mock `TasksView`. */
export default function TarefasPage() {
  redirect("/activities");
}
