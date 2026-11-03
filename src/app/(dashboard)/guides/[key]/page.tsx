"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Callout } from "@/components/kit";
import StrategyGuideView from "@/components/guides/StrategyGuideView";
import { getGuide } from "@/guides";

export default function StrategyGuidePage() {
  const { key } = useParams<{ key: string }>();
  const guide = getGuide(key);
  if (!guide) {
    return (
      <Callout tone="warning" title="No guide for this strategy">
        <Link href="/guides" className="underline underline-offset-2">
          See all guides
        </Link>
      </Callout>
    );
  }
  return <StrategyGuideView guide={guide} />;
}
