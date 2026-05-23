import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { useState } from 'react';
import { KmlTreeNode } from '../types/kmz';

type HierarchyTreeProps = {
  tree: KmlTreeNode;
};

export function HierarchyTree({ tree }: HierarchyTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([tree.id]));

  function toggle(nodeId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-900 text-slate-100">
      <div className="shrink-0 border-b border-slate-800 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Explorer KMZ</h2>
        <p className="mt-1 truncate text-sm font-semibold text-slate-100">{tree.name}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <TreeNode node={tree} depth={0} expanded={expanded} onToggle={toggle} />
      </div>
    </section>
  );
}

type TreeNodeProps = {
  node: KmlTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (nodeId: string) => void;
};

function TreeNode({ node, depth, expanded, onToggle }: TreeNodeProps) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const Icon = hasChildren && isOpen ? ChevronDown : ChevronRight;

  return (
    <div>
      <button
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        type="button"
        onClick={() => hasChildren && onToggle(node.id)}
      >
        {hasChildren ? <Icon size={15} aria-hidden /> : <span className="w-[15px]" />}
        <Folder size={15} className="shrink-0 text-teal-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">{node.placemarkCount}</span>
      </button>
      {isOpen && hasChildren
        ? node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} />
          ))
        : null}
    </div>
  );
}
