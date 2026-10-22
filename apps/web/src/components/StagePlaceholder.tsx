import { Link } from "@tanstack/react-router";
import { EmptyState } from "./EmptyState";
export function StagePlaceholder({ title, stage }: { title: string; stage: string }) {
  return (
    <EmptyState title={title}>
      <p>此功能将在阶段 {stage} 实现。</p>
      <Link to="/" className="btn btn-ghost mt-4">
        返回首页
      </Link>
    </EmptyState>
  );
}
