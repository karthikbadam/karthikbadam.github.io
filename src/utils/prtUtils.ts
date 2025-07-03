import { PackedTreeOptions, TreeNode } from "@kvis/packed-radial-tree";

export const PRT_CONFIG: Partial<PackedTreeOptions> = {
  maxDepth: 2,
  isInterleaved: true,
  isPacked: true,
  isCollisionResolved: true,
  sizeColumn: "subtreeSize",
  showLabels: true,
  showTooltips: true,
  sizeRange: [3, 50],
};

export const googleSearch = (term: string): string =>
  `https://www.google.com/search?q=${encodeURIComponent(term)}`;

export const getDescendants = (node: TreeNode, limit = 10): TreeNode[] => {
  if (!node.children) return [];

  const descendants: TreeNode[] = [];
  const traverse = (n: TreeNode) => {
    if (n.children) {
      n.children.forEach((child) => {
        descendants.push(child);
        traverse(child);
      });
    }
  };

  traverse(node);
  return descendants.slice(0, limit);
};

export const getTopLevelNodes = (
  data: TreeNode | undefined,
  limit = 20
): TreeNode[] => {
  return data?.children ? data.children.slice(0, limit) : [];
};
