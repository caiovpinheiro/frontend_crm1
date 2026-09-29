import { redirect } from "next/navigation";

// A tela de agentes é a de /ai-agents-v2. Redirect preserva bookmarks,
// widgets e links antigos.
export default function AIAgentsPage() {
  redirect("/ai-agents-v2");
}
