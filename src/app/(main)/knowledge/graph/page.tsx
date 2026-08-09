"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Brain, FileText, FlaskConical } from "lucide-react";
import toast from "react-hot-toast";

interface GraphNode {
  id: string;
  label: string;
  group: string;
  size: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
  style?: string;
}

const GROUP_COLORS: Record<string, string> = {
  "文献": "#3B82F6",
  "方法学": "#8B5CF6",
  "理论知识": "#F59E0B",
  "文献综述": "#06B6D4",
  "实验笔记": "#10B981",
  "研究思路": "#EF4444",
  "其他": "#6B7280",
  "未分类": "#9CA3AF",
};

export default function KnowledgeGraphPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null);

  useEffect(() => {
    fetch("/api/knowledge/graph")
      .then((r) => r.json())
      .then((data) => {
        setNodes(data.nodes);
        setEdges(data.edges);
        setLoading(false);
      })
      .catch(() => {
        toast.error("加载图谱失败");
        setLoading(false);
      });
  }, []);

  // 简易力导向布局
  useEffect(() => {
    if (nodes.length === 0 || !svgRef.current) return;

    const width = 800;
    const height = 500;
    const centerX = width / 2;
    const centerY = height / 2;

    // 初始化位置
    const simNodes: GraphNode[] = nodes.map((n) => ({
      ...n,
      x: centerX + (Math.random() - 0.5) * 200,
      y: centerY + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0,
    }));

    // 力导向模拟
    const tick = () => {
      // 排斥力（节点间）
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const dx = (simNodes[j].x || 0) - (simNodes[i].x || 0);
          const dy = (simNodes[j].y || 0) - (simNodes[i].y || 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 600 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          simNodes[i].vx = (simNodes[i].vx || 0) - fx;
          simNodes[i].vy = (simNodes[i].vy || 0) - fy;
          simNodes[j].vx = (simNodes[j].vx || 0) + fx;
          simNodes[j].vy = (simNodes[j].vy || 0) + fy;
        }
      }

      // 吸引力（边）
      for (const edge of edges) {
        const src = simNodes.find((n) => n.id === edge.source);
        const tgt = simNodes.find((n) => n.id === edge.target);
        if (!src || !tgt) continue;
        const dx = (tgt.x || 0) - (src.x || 0);
        const dy = (tgt.y || 0) - (src.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 80) * 0.005;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        src.vx = (src.vx || 0) + fx;
        src.vy = (src.vy || 0) + fy;
        tgt.vx = (tgt.vx || 0) - fx;
        tgt.vy = (tgt.vy || 0) - fy;
      }

      // 中心引力
      for (const n of simNodes) {
        n.vx = (n.vx || 0) + (centerX - (n.x || 0)) * 0.001;
        n.vy = (n.vy || 0) + (centerY - (n.y || 0)) * 0.001;
      }

      // 更新位置 + 阻尼
      for (const n of simNodes) {
        n.vx = (n.vx || 0) * 0.9;
        n.vy = (n.vy || 0) * 0.9;
        n.x = (n.x || 0) + (n.vx || 0);
        n.y = (n.y || 0) + (n.vy || 0);
      }

      setNodes([...simNodes]);
    };

    const interval = setInterval(tick, 16);
    const timeout = setTimeout(() => clearInterval(interval), 8000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [edges.length]);

  const getNodeColor = (group: string) => GROUP_COLORS[group] || "#6B7280";
  const getNodeRadius = (size: number) => 8 + size * 6;
  const getNodeHref = (id: string) => {
    if (id.startsWith("paper:")) return `/papers/${id.replace("paper:", "")}`;
    return `/knowledge/${id}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/knowledge" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
            <ArrowLeft className="h-4 w-4" />返回笔记列表
          </Link>
          <h1 className="text-2xl font-semibold">知识图谱</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {nodes.length} 个节点 · {edges.length} 条关联
          </p>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border rounded-xl">
          <Brain className="h-12 w-12 mb-3 opacity-20" />
          <p className="text-sm">暂无知识节点</p>
          <p className="text-xs mt-1 opacity-60">创建笔记并使用 [[双链引用]] 建立知识关联</p>
          <Link href="/knowledge" className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
            创建笔记
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden relative">
          <svg
            ref={svgRef}
            viewBox="0 0 800 500"
            className="w-full"
            style={{ minHeight: 500 }}
          >
            {/* 边 */}
            {edges.map((edge, i) => {
              const src = nodes.find((n) => n.id === edge.source);
              const tgt = nodes.find((n) => n.id === edge.target);
              if (!src || !src.x || !tgt || !tgt.x) return null;
              const isDashed = edge.style === "dashed";
              return (
                <line
                  key={i}
                  x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke={isDashed ? "#9CA3AF" : "#e5e7eb"}
                  strokeWidth={1}
                  strokeOpacity={isDashed ? 0.4 : 0.6}
                  strokeDasharray={isDashed ? "4,3" : undefined}
                />
              );
            })}

            {/* 节点 */}
            {nodes.map((node) => {
              if (!node.x) return null;
              const color = getNodeColor(node.group);
              const r = getNodeRadius(node.size);
              const href = getNodeHref(node.id);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer"
                  onMouseEnter={(e) => {
                    const rect = (e.currentTarget.closest("svg") as SVGSVGElement)?.getBoundingClientRect();
                    if (rect) {
                      setTooltip({
                        x: node.x! * (rect.width / 800) + 10,
                        y: node.y! * (rect.height / 500) - 10,
                        node,
                      });
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => {
                    window.location.href = href;
                  }}
                >
                  <circle r={r} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1.5} />
                  <circle r={3} fill={color} />
                  <text
                    y={r + 12}
                    textAnchor="middle"
                    className="fill-current"
                    style={{ fontSize: 9, fill: "#6B7280" }}
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute bg-background border rounded-lg shadow-lg px-3 py-2 text-xs pointer-events-none z-10"
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <p className="font-medium">{tooltip.node.label}</p>
              <p className="text-muted-foreground">{tooltip.node.group}</p>
            </div>
          )}

          {/* 图例 */}
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 bg-background/90 backdrop-blur rounded-lg border px-3 py-2">
            {["文献", "方法学", "理论知识", "文献综述", "实验笔记", "研究思路", "其他"].map((g) => (
              <div key={g} className="flex items-center gap-1 text-[10px]">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GROUP_COLORS[g] || "#6B7280" }} />
                {g}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
