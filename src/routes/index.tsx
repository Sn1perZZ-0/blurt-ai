import { createFileRoute } from "@tanstack/react-router";
import BlurtDashboard from "@/components/BlurtDashboard";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "BlurtAI — Active Recall Revision for GCSE & A-Level" },
      {
        name: "description",
        content:
          "Blurt out loud, get AI-marked feedback. Active recall revision tool for UK GCSE and A-Level students.",
      },
      { property: "og:title", content: "BlurtAI — Active Recall Revision" },
      {
        property: "og:description",
        content: "Speak what you know. AI marks your gaps against the spec.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Index() {
  return <BlurtDashboard />;
}
